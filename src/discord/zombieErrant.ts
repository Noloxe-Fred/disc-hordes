import { CauseMort, StatutJoueur } from "@prisma/client";
import type { Guild } from "discord.js";
import { DEGATS_SURPRISE_TRANSFORME, PV_ZOMBIE, PV_ZOMBIE_TRANSFORME_EN_VILLE } from "../config/combat";
import { prisma } from "../db";
import { calculerEtatInfection } from "../game/infection";
import { enregistrerMort } from "../game/mort";
import { infligerDegats, tenterInfection } from "../game/sante";
import { trouverSalonTexte } from "./reconcile";
import { posterDansMairie } from "./villeStructure";

// Citoyens transformes en zombie au bout des 96h d'incubation (equilibrage.md §1). Le joueur meurt (statut Zombifie,
// cause « transforme en zombie ») et son zombie reste la ou il s'est transforme : en ville ou dans sa zone. Il se jette
// par surprise (-1 PV, coup recu) sur un survivant present, choisi au hasard, qui doit ensuite le combattre comme un
// zombie ordinaire. S'il n'y a personne, il attend : le premier survivant qui arrive (ou, en ville, qui s'y trouve a la
// verification suivante) est attaque. En ville, un survivant qui le fuit le laisse se jeter sur un autre citoyen
// (le meme s'il est seul) ; dehors, il reste dans la zone.

function survivantsPresents(errant: { villeId: number; zoneId: number | null }) {
  return prisma.joueur.findMany({
    where:
      errant.zoneId === null
        ? { villeId: errant.villeId, zoneActuelleId: null, statut: StatutJoueur.VIVANT, dateSortie: null, rencontrePvZombie: null }
        : {
            zoneActuelleId: errant.zoneId,
            statut: { in: [StatutJoueur.VIVANT, StatutJoueur.EXCLU] },
            dateSortie: null,
            rencontrePvZombie: null,
          },
    include: { utilisateur: true },
  });
}

// Zombie errant que combat ce joueur, ou null
export function zombieAffrontePar(joueurId: number) {
  return prisma.zombieErrant.findUnique({ where: { cibleId: joueurId }, include: { transforme: { include: { utilisateur: true } } } });
}

// Le joueur ne combat plus son zombie errant (deplacement force, mort, sortie) : celui-ci reste sur place, sans cible
export async function libererZombieErrant(joueurId: number): Promise<void> {
  await prisma.zombieErrant.updateMany({ where: { cibleId: joueurId }, data: { cibleId: null } });
}

// Le zombie errant se jette sur un survivant present : cibleId impose (arrivee dans la zone ou en ville), sinon tire au
// hasard en evitant exclureId s'il y a quelqu'un d'autre. Renvoie la victime et le texte pour elle, ou null si personne.
// prevenir : la victime n'a pas declenche l'attaque elle-meme, elle est mentionnee dans le salon du lieu.
export async function attaquerAvecZombieErrant(
  guild: Guild,
  errantId: number,
  options: { cibleId?: number; exclureId?: number; prevenir?: boolean } = {},
): Promise<{ victimeId: number; texte: string } | null> {
  const errant = await prisma.zombieErrant.findUnique({ where: { id: errantId }, include: { transforme: { include: { utilisateur: true } } } });
  if (!errant || errant.cibleId !== null) return null;
  const presents = await survivantsPresents(errant);
  const candidats = options.cibleId !== undefined ? presents.filter((j) => j.id === options.cibleId) : presents;
  const autres = candidats.filter((j) => j.id !== options.exclureId);
  const choix = autres.length > 0 ? autres : candidats;
  if (choix.length === 0) return null;
  const victime = choix[Math.floor(Math.random() * choix.length)];

  const qui = `🧟 **<@${errant.transforme.utilisateur.discordId}>, transformé en zombie**,`;
  const resultat = await infligerDegats(guild, victime.id, DEGATS_SURPRISE_TRANSFORME, CauseMort.ZOMBIE_ERRANT);
  let texte: string;
  if (resultat.mort) {
    texte = `${qui} se jette sur vous par surprise… **vous succombez.** 💀`;
    if (errant.zoneId === null && !resultat.villeTombee) {
      await posterDansMairie(
        guild,
        errant.villeId,
        `💀 <@${victime.utilisateur.discordId}> a été dévoré par <@${errant.transforme.utilisateur.discordId}>, transformé en zombie.`,
      );
    }
  } else {
    await tenterInfection(victime.id); // infection cachee
    await prisma.$transaction([
      prisma.joueur.update({
        where: { id: victime.id },
        data: { rencontrePvZombie: errant.pv, rencontreRetourZoneId: null, rencontreRetourVille: false, fouillesSansRencontre: 0 },
      }),
      prisma.zombieErrant.update({ where: { id: errant.id }, data: { cibleId: victime.id } }),
    ]);
    texte =
      `${qui} se jette sur vous par surprise : −${DEGATS_SURPRISE_TRANSFORME} PV (${resultat.pvRestants} restants). ` +
      "Combattez-le ou fuyez dans `/action`.";
  }

  if (options.prevenir) {
    const salon = await trouverSalonTexte(
      guild,
      errant.zoneId === null ? `salon:ville:${errant.villeId}:place-publique` : `salon:zone:${errant.zoneId}`,
    );
    await salon
      ?.send({ content: `<@${victime.utilisateur.discordId}> ${texte}`, allowedMentions: { users: [victime.utilisateur.discordId] } })
      .catch(() => null);
  }
  return { victimeId: victime.id, texte };
}

// Arrivee d'un survivant dans une zone (ou retour en ville) : un zombie errant libre sur place l'attaque aussitot
export async function zombieErrantALArrivee(guild: Guild, joueurId: number, villeId: number, zoneId: number | null): Promise<string | null> {
  const errant = await prisma.zombieErrant.findFirst({ where: { cibleId: null, ...(zoneId === null ? { villeId, zoneId: null } : { zoneId }) } });
  return errant ? ((await attaquerAvecZombieErrant(guild, errant.id, { cibleId: joueurId }))?.texte ?? null) : null;
}

// Incubations arrivees a terme : mort par infection, zombie cree sur place, qui attaque aussitot si quelqu'un est la
async function transformerInfectes(guild: Guild): Promise<void> {
  const infectes = await prisma.joueur.findMany({
    where: { statut: { in: [StatutJoueur.VIVANT, StatutJoueur.EXCLU] }, dateSortie: null, infecteDepuis: { not: null } },
    include: { zoneActuelle: true, utilisateur: true },
  });
  for (const joueur of infectes) {
    if (!calculerEtatInfection(joueur.infecteDepuis!).zombifie || joueur.villeId === null) continue;
    const zone = joueur.zoneActuelle;
    await libererZombieErrant(joueur.id);
    const villeTombee = await enregistrerMort(guild, joueur.id, CauseMort.INFECTION);
    if (villeTombee) continue;
    const pv = zone ? PV_ZOMBIE[zone.palier] : PV_ZOMBIE_TRANSFORME_EN_VILLE;
    const errant = await prisma.zombieErrant.create({
      data: { transformeId: joueur.id, villeId: joueur.villeId, zoneId: zone?.id ?? null, pv, pvMax: pv },
    });
    // Dehors, le lieu reste un secret : la mairie n'apprend que la mort
    await posterDansMairie(
      guild,
      joueur.villeId,
      zone
        ? `🧟 <@${joueur.utilisateur.discordId}> a succombé à l'infection, quelque part en territoire externe.`
        : `🧟 <@${joueur.utilisateur.discordId}> a succombé à l'infection… et **se relève en zombie, en pleine ville !**`,
    );
    await attaquerAvecZombieErrant(guild, errant.id, { prevenir: true });
  }
}

// Verification periodique : transformations, puis zombies errants sans cible qui trouvent un survivant sur place
export async function verifierZombiesErrants(guild: Guild): Promise<void> {
  await transformerInfectes(guild);
  for (const errant of await prisma.zombieErrant.findMany({ where: { cibleId: null, ville: { statut: "ACTIVE" } } })) {
    await attaquerAvecZombieErrant(guild, errant.id, { prevenir: true });
  }
}
