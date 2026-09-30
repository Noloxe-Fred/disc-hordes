import { CauseMort, StatutJoueur, TypePhase, type PalierZone } from "@prisma/client";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder, type Guild } from "discord.js";
import { DEGATS_HORDE_AUBE, DEGATS_RENCONTRE_PAR_PHASE, DEGATS_ZOMBIE, PROTECTION_FEU_HORDE, PV_ZOMBIE } from "../config/combat";
import { emojiObjet } from "../config/objets";
import { prisma } from "../db";
import { feuActif } from "../game/feu";
import { coutAttaque, coutFuite, echangerCoups, meilleureArme, tenterFuite, tirerRencontre } from "../game/combat";
import { infligerDegats, tenterInfection } from "../game/sante";
import { deplacerJoueur } from "./deplacement";
import { trouverSalonTexte } from "./reconcile";
import { attaquerAvecZombieErrant, libererZombieErrant, zombieAffrontePar } from "./zombieErrant";

// Rencontres de zombies en territoire externe et combat (equilibrage.md §4 et §5). Une rencontre se tire apres chaque
// fouille et a chaque arrivee dans une zone ; tant qu'elle dure, /action ne propose plus qu'« Attaquer » et « Fuir ».
// Etat en base sur le joueur (PV restants du zombie, zone de repli en cas de fuite).

const COULEUR_COMBAT = 0xc0392b;

// Donnees de fin de rencontre (victoire, fuite, mort, deplacement force)
export const FIN_RENCONTRE = { rencontrePvZombie: null, rencontreRetourZoneId: null, rencontreRetourVille: false };

export interface RepliFuite {
  zoneId: number | null;
  ville: boolean;
}

// Jet de rencontre dans la zone ou se trouve le joueur, plus probable a chaque fouille d'affilee sans zombie et deux
// fois moins avec un feu allume ; si un
// zombie surgit, la rencontre est enregistree et le compteur de fouilles remis a 0, sinon une fouille l'augmente.
// Renvoie le texte a ajouter au compte rendu de l'action, ou null.
export async function declencherRencontre(
  joueurId: number,
  palier: PalierZone,
  phase: TypePhase,
  repli: RepliFuite,
  apresFouille: boolean,
): Promise<string | null> {
  const { fouillesSansRencontre, zoneActuelle, ville } = await prisma.joueur.findUniqueOrThrow({
    where: { id: joueurId },
    include: { zoneActuelle: true, ville: true },
  });
  if (!tirerRencontre(palier, phase, fouillesSansRencontre, ville !== null && feuActif(zoneActuelle, ville))) {
    if (apresFouille) await prisma.joueur.update({ where: { id: joueurId }, data: { fouillesSansRencontre: { increment: 1 } } });
    return null;
  }
  const pv = PV_ZOMBIE[palier];
  const joueur = await prisma.joueur.update({
    where: { id: joueurId },
    data: { rencontrePvZombie: pv, rencontreRetourZoneId: repli.zoneId, rencontreRetourVille: repli.ville, fouillesSansRencontre: 0 },
  });
  await prisma.journalEntree.create({ data: { villeId: joueur.villeId!, joueurId, message: "Rencontre : un zombie surgit", public: false } });
  return `🧟 **Un zombie surgit !** (❤️ ${pv} PV) Vous devez l'affronter ou fuir avant de faire quoi que ce soit d'autre.`;
}

async function armeDuJoueur(joueurId: number) {
  const sac = await prisma.inventaireJoueur.findMany({ where: { joueurId, quantite: { gt: 0 } }, include: { objet: true } });
  return meilleureArme(sac.map((e) => e.objet.nom));
}

// Ecran de combat : etat du zombie, arme utilisee, boutons « Attaquer » et « Fuir » avec leur cout
export async function ecranCombat(joueurId: number, texte?: string): Promise<ContainerBuilder> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true, zoneActuelle: true } });
  const phase = joueur.ville!.phaseActuelle;
  const arme = await armeDuJoueur(joueurId);
  // Citoyen transforme en zombie (discord/zombieErrant.ts) : il est nomme
  const errant = await zombieAffrontePar(joueurId);
  const pvMax = errant?.pvMax ?? (joueur.zoneActuelle ? PV_ZOMBIE[joueur.zoneActuelle.palier] : (joueur.rencontrePvZombie ?? 0));
  const adversaire = errant ? `🧟 <@${errant.transforme.utilisateur.discordId}>, **citoyen transformé en zombie**` : "🧟 Zombie";
  return new ContainerBuilder()
    .setAccentColor(COULEUR_COMBAT)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        (texte ? `${texte}\n\n` : "") +
          `## ⚔️ Combat — ${joueur.zoneActuelle?.nom ?? "en ville"}\n` +
          `${adversaire} : ❤️ **${joueur.rencontrePvZombie} / ${pvMax}** PV · Vous : ❤️ ${joueur.pv} PV · ⚡ ${joueur.paActuel ?? 0} PA\n` +
          (arme ? `${emojiObjet(arme.nom)} Vous vous battez avec : **${arme.nom}**.` : "✊ Vous vous battez à mains nues."),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("attaquer")
          .setLabel(`Attaquer (${coutAttaque(phase, arme)} PA)`)
          .setEmoji("⚔️")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("fuir").setLabel(`Fuir (${coutFuite(phase)} PA)`).setEmoji("🏃").setStyle(ButtonStyle.Secondary),
      ),
    );
}

export interface ResultatCombat {
  texte: string;
  // La rencontre continue : l'ecran de combat reste affiche
  enCours: boolean;
}

async function joueurEnRencontre(joueurId: number) {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true, utilisateur: true } });
  const actif = joueur.statut === StatutJoueur.VIVANT || joueur.statut === StatutJoueur.EXCLU;
  return actif && joueur.rencontrePvZombie !== null ? joueur : null;
}

// Echange de coups : PA depenses, coup du joueur, puis riposte eventuelle du zombie encore debout (coup recu :
// -1 PV et 10 % d'infection)
export async function attaquer(guild: Guild, joueurId: number): Promise<ResultatCombat> {
  const joueur = await joueurEnRencontre(joueurId);
  if (!joueur) return { texte: "Il n'y a plus de zombie face à vous.", enCours: false };
  const arme = await armeDuJoueur(joueurId);
  const cout = coutAttaque(joueur.ville!.phaseActuelle, arme);
  if ((joueur.paActuel ?? 0) < cout) {
    return { texte: `Il vous faut **${cout} PA** pour attaquer (vous en avez ${joueur.paActuel ?? 0}).`, enCours: true };
  }

  const echange = echangerCoups(joueur.rencontrePvZombie!, arme);
  const vaincu = echange.pvZombie <= 0;
  const errant = await zombieAffrontePar(joueurId);
  await prisma.$transaction([
    prisma.joueur.update({
      where: { id: joueurId },
      data: { paActuel: { decrement: cout }, ...(vaincu ? FIN_RENCONTRE : { rencontrePvZombie: echange.pvZombie }) },
    }),
    // Un citoyen transforme abattu disparait ; sinon il garde ses blessures, meme si le joueur tombe ou s'en va
    ...(errant
      ? [
          vaincu
            ? prisma.zombieErrant.delete({ where: { id: errant.id } })
            : prisma.zombieErrant.update({ where: { id: errant.id }, data: { pv: echange.pvZombie } }),
        ]
      : []),
  ]);
  const lignes = [
    echange.touche ? `⚔️ Vous frappez le zombie (−${echange.degats} PV, −${cout} PA).` : `💨 Vous manquez votre coup (−${cout} PA).`,
  ];
  if (vaincu) {
    await prisma.journalEntree.create({ data: { villeId: joueur.villeId!, joueurId, message: "Combat : zombie abattu", public: false } });
    lignes.push(
      errant
        ? `💀 **<@${errant.transforme.utilisateur.discordId}> s'effondre pour de bon.** Vous pouvez reprendre vos actions.`
        : "💀 **Le zombie s'effondre.** Vous pouvez reprendre vos actions.",
    );
    return { texte: lignes.join("\n"), enCours: false };
  }
  if (!echange.riposte) {
    lignes.push("🛡️ Le zombie vous rate.");
    return { texte: lignes.join("\n"), enCours: true };
  }

  const resultat = await infligerDegats(guild, joueurId, DEGATS_ZOMBIE, errant ? CauseMort.ZOMBIE_ERRANT : CauseMort.COMBAT_EXTERIEUR);
  if (resultat.mort) {
    lignes.push("🩸 Le zombie vous frappe… **vous succombez.** 💀");
    return { texte: lignes.join("\n"), enCours: false };
  }
  await tenterInfection(joueurId); // infection cachee : rien n'est dit au joueur ici (conception.md §3)
  lignes.push(`🩸 Le zombie vous frappe : −${DEGATS_ZOMBIE} PV (${resultat.pvRestants} restants).`);
  return { texte: lignes.join("\n"), enCours: true };
}

// Fuite : PA depenses ; reussie, le joueur repart vers la zone d'ou il venait (ou la ville), ou reste sur place s'il
// fouillait ; ratee, le zombie frappe (-1 PV, sans infection) et la rencontre continue
export async function fuir(guild: Guild, joueurId: number): Promise<ResultatCombat> {
  const joueur = await joueurEnRencontre(joueurId);
  if (!joueur) return { texte: "Il n'y a plus de zombie face à vous.", enCours: false };
  const phase = joueur.ville!.phaseActuelle;
  const cout = coutFuite(phase);
  if ((joueur.paActuel ?? 0) < cout) {
    return { texte: `Il vous faut **${cout} PA** pour fuir (vous en avez ${joueur.paActuel ?? 0}).`, enCours: true };
  }
  await prisma.joueur.update({ where: { id: joueurId }, data: { paActuel: { decrement: cout } } });

  const errant = await zombieAffrontePar(joueurId);
  if (!tenterFuite(phase)) {
    const resultat = await infligerDegats(guild, joueurId, DEGATS_ZOMBIE, errant ? CauseMort.ZOMBIE_ERRANT : CauseMort.COMBAT_EXTERIEUR);
    if (resultat.mort) return { texte: `🏃 Vous tentez de fuir (−${cout} PA)… le zombie vous rattrape. **Vous succombez.** 💀`, enCours: false };
    return {
      texte: `🏃 Vous tentez de fuir (−${cout} PA)… le zombie vous rattrape et vous frappe : −${DEGATS_ZOMBIE} PV (${resultat.pvRestants} restants).`,
      enCours: true,
    };
  }

  const repli = joueur.rencontreRetourVille ? null : joueur.rencontreRetourZoneId;
  const bouge = joueur.rencontreRetourVille || joueur.rencontreRetourZoneId !== null;
  await prisma.joueur.update({ where: { id: joueurId }, data: FIN_RENCONTRE });
  if (errant) {
    await libererZombieErrant(joueurId);
    await prisma.journalEntree.create({ data: { villeId: joueur.villeId!, joueurId, message: "Combat : fuite réussie", public: false } });
    const nom = `<@${errant.transforme.utilisateur.discordId}>`;
    if (errant.zoneId !== null) {
      return { texte: `🏃 Vous prenez la fuite (−${cout} PA). ${nom} rôde toujours dans la zone : éloignez-vous vite.`, enCours: false };
    }
    // En ville, il se jette sur un autre citoyen present, ou de nouveau sur vous si vous etes seul
    const suite = await attaquerAvecZombieErrant(guild, errant.id, { exclureId: joueurId, prevenir: true });
    const fuite = `🏃 Vous prenez la fuite (−${cout} PA).`;
    if (suite?.victimeId !== joueurId) return { texte: `${fuite} ${nom} se jette sur un autre citoyen.`, enCours: false };
    return {
      texte: `${fuite} Il n'y a personne d'autre en ville : ${nom} revient sur vous.\n${suite.texte}`,
      enCours: (await zombieAffrontePar(joueurId)) !== null,
    };
  }
  const pendaison = bouge ? await deplacerJoueur(guild, joueur, repli, 0) : null;
  if (pendaison) return { texte: `🏃 Vous prenez la fuite (−${cout} PA) et vous réfugiez en ville.
${pendaison}`, enCours: false };
  await prisma.journalEntree.create({ data: { villeId: joueur.villeId!, joueurId, message: "Combat : fuite réussie", public: false } });
  const nomRepli = repli === null ? null : (await prisma.zone.findUnique({ where: { id: repli } }))?.nom;
  const destination = !bouge
    ? "Vous le semez sans quitter la zone."
    : repli === null
      ? `Vous vous réfugiez à **${joueur.ville!.nom}**.`
      : `Vous rebroussez chemin vers **${nomRepli ?? "la zone précédente"}**.`;
  return { texte: `🏃 Vous prenez la fuite (−${cout} PA). ${destination}`, enCours: false };
}

// --- Evenements des changements de phase pour les survivants dehors (vivants ou exclus) de la ville ---
// debutPhaseFinie : debut de la phase qui s'acheve, pour savoir si un feu y brulait encore au moment de la bascule.

export interface BilanDehors {
  // Lignes du compte rendu de la mairie (morts)
  lignes: string[];
  villeTombee: boolean;
}

function survivantsDehors(villeId: number) {
  return prisma.joueur.findMany({
    where: {
      villeId,
      statut: { in: [StatutJoueur.VIVANT, StatutJoueur.EXCLU] },
      dateSortie: null,
      zoneActuelleId: { not: null },
    },
    include: { utilisateur: true, zoneActuelle: true },
  });
}

async function prevenirDansLaZone(guild: Guild, zoneId: number, discordId: string, texte: string) {
  const salon = await trouverSalonTexte(guild, `salon:zone:${zoneId}`);
  await salon?.send({ content: `<@${discordId}> ${texte}`, allowedMentions: { users: [discordId] } }).catch(() => null);
}

async function ouvrirRencontre(joueurId: number, palier: PalierZone) {
  await prisma.joueur.update({
    where: { id: joueurId },
    data: { rencontrePvZombie: PV_ZOMBIE[palier], rencontreRetourZoneId: null, rencontreRetourVille: false, fouillesSansRencontre: 0 },
  });
}

// Tombee de la nuit : un zombie laisse en plan ronge son joueur (-1 PV) ; sinon, jet de rencontre au taux de nuit de la zone
// (feu : /2, sans le bonus des fouilles). Un zombie qui surgit ouvre la rencontre, sans degats immediats.
export async function evenementsTombeeNuit(guild: Guild, villeId: number, debutPhaseFinie: Date | null): Promise<BilanDehors> {
  const lignes: string[] = [];
  for (const joueur of await survivantsDehors(villeId)) {
    const zone = joueur.zoneActuelle!;
    const mention = joueur.utilisateur.discordId;
    if (joueur.rencontrePvZombie !== null) {
      const resultat = await infligerDegats(guild, joueur.id, DEGATS_RENCONTRE_PAR_PHASE, CauseMort.COMBAT_EXTERIEUR);
      if (resultat.mort) lignes.push(`💀 <@${mention}> a été dévoré par un zombie en territoire externe.`);
      if (resultat.villeTombee) return { lignes, villeTombee: true };
      if (!resultat.mort) {
        const texte = `🧟 le zombie que vous avez laissé vous ronge : −${DEGATS_RENCONTRE_PAR_PHASE} PV. Réglez-le dans \`/action\`.`;
        await prevenirDansLaZone(guild, zone.id, mention, texte);
      }
      continue;
    }
    if (!tirerRencontre(zone.palier, TypePhase.NUIT, 0, feuActif(zone, { phaseDepuis: debutPhaseFinie }))) continue;
    await ouvrirRencontre(joueur.id, zone.palier);
    await prevenirDansLaZone(guild, zone.id, mention, "🌙 la nuit tombe et un zombie sort de l'ombre ! Combattez ou fuyez dans `/action`.");
  }
  return { lignes, villeTombee: false };
}

// Aube : la horde balaie les territoires. Tout survivant dehors perd d'entree 1/2/3 PV selon sa zone (un feu encore
// allume en retire 1), coup recu (10 % d'infection), puis un combat s'ouvre s'il n'avait pas deja un zombie sur le dos.
export async function hordeAube(guild: Guild, villeId: number, debutPhaseFinie: Date | null): Promise<BilanDehors> {
  const lignes: string[] = [];
  for (const joueur of await survivantsDehors(villeId)) {
    const zone = joueur.zoneActuelle!;
    const mention = joueur.utilisateur.discordId;
    const feu = feuActif(zone, { phaseDepuis: debutPhaseFinie });
    const degats = Math.max(0, DEGATS_HORDE_AUBE[zone.palier] - (feu ? PROTECTION_FEU_HORDE : 0));
    let pvRestants = joueur.pv;
    if (degats > 0) {
      const resultat = await infligerDegats(guild, joueur.id, degats, CauseMort.COMBAT_EXTERIEUR);
      if (resultat.mort) lignes.push(`💀 <@${mention}> a été dévoré par la horde à l'aube (${zone.nom}).`);
      if (resultat.villeTombee) return { lignes, villeTombee: true };
      if (resultat.mort) continue;
      pvRestants = resultat.pvRestants;
      await tenterInfection(joueur.id); // infection cachee
    }
    if (joueur.rencontrePvZombie === null) await ouvrirRencontre(joueur.id, zone.palier);
    const coup =
      degats === 0
        ? ", mais votre feu la tient à distance"
        : ` : −${degats} PV (${pvRestants} restants)${feu ? ", votre feu vous a épargné un coup" : ""}`;
    const texte = `☀️ l'aube se lève et la horde déferle sur vous${coup}. Un zombie reste sur vous : combattez ou fuyez dans \`/action\`.`;
    await prevenirDansLaZone(guild, zone.id, mention, texte);
  }
  return { lignes, villeTombee: false };
}
