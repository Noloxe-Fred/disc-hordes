import { CauseMort, StatutJoueur, type PalierZone, type TypePhase } from "@prisma/client";
import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ContainerBuilder, TextDisplayBuilder, type Guild } from "discord.js";
import { DEGATS_RENCONTRE_PAR_PHASE, DEGATS_ZOMBIE, PV_ZOMBIE } from "../config/combat";
import { emojiObjet } from "../config/objets";
import { prisma } from "../db";
import { coutAttaque, coutFuite, echangerCoups, meilleureArme, tenterFuite, tirerRencontre } from "../game/combat";
import { infligerDegats, tenterInfection } from "../game/sante";
import { deplacerJoueur } from "./deplacement";

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

// Jet de rencontre dans la zone ou se trouve le joueur ; si un zombie surgit, la rencontre est enregistree.
// Renvoie le texte a ajouter au compte rendu de l'action, ou null.
export async function declencherRencontre(
  joueurId: number,
  palier: PalierZone,
  phase: TypePhase,
  repli: RepliFuite,
): Promise<string | null> {
  if (!tirerRencontre(palier, phase)) return null;
  const pv = PV_ZOMBIE[palier];
  const joueur = await prisma.joueur.update({
    where: { id: joueurId },
    data: { rencontrePvZombie: pv, rencontreRetourZoneId: repli.zoneId, rencontreRetourVille: repli.ville },
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
  const pvMax = joueur.zoneActuelle ? PV_ZOMBIE[joueur.zoneActuelle.palier] : (joueur.rencontrePvZombie ?? 0);
  return new ContainerBuilder()
    .setAccentColor(COULEUR_COMBAT)
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        (texte ? `${texte}\n\n` : "") +
          `## ⚔️ Combat — ${joueur.zoneActuelle?.nom ?? "?"}\n` +
          `🧟 Zombie : ❤️ **${joueur.rencontrePvZombie} / ${pvMax}** PV · Vous : ❤️ ${joueur.pv} PV · ⚡ ${joueur.paActuel ?? 0} PA\n` +
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
  await prisma.joueur.update({
    where: { id: joueurId },
    data: { paActuel: { decrement: cout }, ...(vaincu ? FIN_RENCONTRE : { rencontrePvZombie: echange.pvZombie }) },
  });
  const lignes = [
    echange.touche ? `⚔️ Vous frappez le zombie (−${echange.degats} PV, −${cout} PA).` : `💨 Vous manquez votre coup (−${cout} PA).`,
  ];
  if (vaincu) {
    await prisma.journalEntree.create({ data: { villeId: joueur.villeId!, joueurId, message: "Combat : zombie abattu", public: false } });
    lignes.push("💀 **Le zombie s'effondre.** Vous pouvez reprendre vos actions.");
    return { texte: lignes.join("\n"), enCours: false };
  }
  if (!echange.riposte) {
    lignes.push("🛡️ Le zombie vous rate.");
    return { texte: lignes.join("\n"), enCours: true };
  }

  const resultat = await infligerDegats(guild, joueurId, DEGATS_ZOMBIE, CauseMort.COMBAT_EXTERIEUR);
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

  if (!tenterFuite(phase)) {
    const resultat = await infligerDegats(guild, joueurId, DEGATS_ZOMBIE, CauseMort.COMBAT_EXTERIEUR);
    if (resultat.mort) return { texte: `🏃 Vous tentez de fuir (−${cout} PA)… le zombie vous rattrape. **Vous succombez.** 💀`, enCours: false };
    return {
      texte: `🏃 Vous tentez de fuir (−${cout} PA)… le zombie vous rattrape et vous frappe : −${DEGATS_ZOMBIE} PV (${resultat.pvRestants} restants).`,
      enCours: true,
    };
  }

  const repli = joueur.rencontreRetourVille ? null : joueur.rencontreRetourZoneId;
  const bouge = joueur.rencontreRetourVille || joueur.rencontreRetourZoneId !== null;
  await prisma.joueur.update({ where: { id: joueurId }, data: FIN_RENCONTRE });
  if (bouge) await deplacerJoueur(guild, joueur, repli, 0);
  await prisma.journalEntree.create({ data: { villeId: joueur.villeId!, joueurId, message: "Combat : fuite réussie", public: false } });
  const nomRepli = repli === null ? null : (await prisma.zone.findUnique({ where: { id: repli } }))?.nom;
  const destination = !bouge
    ? "Vous le semez sans quitter la zone."
    : repli === null
      ? `Vous vous réfugiez à **${joueur.ville!.nom}**.`
      : `Vous rebroussez chemin vers **${nomRepli ?? "la zone précédente"}**.`;
  return { texte: `🏃 Vous prenez la fuite (−${cout} PA). ${destination}`, enCours: false };
}

// Rencontres laissees en suspens au changement de phase : -1 PV (le zombie rode toujours). Renvoie les annonces de
// mort pour la mairie, et si la ville est tombee.
export async function blesserRencontresEnSuspens(guild: Guild, villeId: number): Promise<{ morts: string[]; villeTombee: boolean }> {
  const joueurs = await prisma.joueur.findMany({
    where: { villeId, statut: StatutJoueur.VIVANT, dateSortie: null, rencontrePvZombie: { not: null } },
    include: { utilisateur: true },
  });
  const morts: string[] = [];
  for (const joueur of joueurs) {
    const resultat = await infligerDegats(guild, joueur.id, DEGATS_RENCONTRE_PAR_PHASE, CauseMort.COMBAT_EXTERIEUR);
    if (resultat.mort) morts.push(`💀 <@${joueur.utilisateur.discordId}> a été dévoré par un zombie en territoire externe.`);
    if (resultat.villeTombee) return { morts, villeTombee: true };
  }
  return { morts, villeTombee: false };
}
