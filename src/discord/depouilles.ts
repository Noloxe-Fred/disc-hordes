import { StatutJoueur, StatutVille } from "@prisma/client";
import { LabelBuilder, ModalBuilder, StringSelectMenuBuilder, type ButtonInteraction, type Guild, type ModalSubmitInteraction } from "discord.js";
import { emojiObjet, OBJET_RADIO, poidsObjet } from "../config/objets";
import { prisma } from "../db";
import { chargeSac, deborde, libelleCharge } from "../services/charge";
import { champQuantite, lireQuantite } from "./champsObjets";
import { synchroniserAccesJoueur } from "./joueurDiscord";
import { trouverSalonTexte } from "./reconcile";

// Corps des morts (conception.md §3, equilibrage.md §1) : le sac d'un joueur mort reste la ou il est tombe, en ville ou
// dans sa zone (Joueur.zoneMortId). Les survivants presents peuvent le fouiller depuis /action (« Fouiller un corps ») :
// un formulaire unique (une liste d'objets par corps + quantite), gratuit en PA, dans la limite du poids du sac.

const DELAI_FORMULAIRE_MS = 120_000;
const OPTIONS_MAX = 25;
// Un formulaire tient 5 champs : 4 corps au plus, plus la quantite
const CORPS_MAX = 4;

function nomJoueur(joueur: { utilisateur: { discordId: string; pseudoCache: string | null } }): string {
  return joueur.utilisateur.pseudoCache ?? joueur.utilisateur.discordId;
}

// Corps au meme endroit que le joueur et dont le sac n'est pas vide : en ville, les morts de sa ville tombes en ville ;
// dehors, tous les morts tombes dans sa zone, quelle que soit leur ville
export function corpsAuMemeEndroit(joueur: { id: number; villeId: number | null; zoneActuelleId: number | null }) {
  return prisma.joueur.findMany({
    where: {
      id: { not: joueur.id },
      statut: { in: [StatutJoueur.MORT, StatutJoueur.ZOMBIFIE] },
      inventaire: { some: { quantite: { gt: 0 } } },
      ...(joueur.zoneActuelleId === null ? { villeId: joueur.villeId, zoneMortId: null } : { zoneMortId: joueur.zoneActuelleId }),
    },
    include: {
      utilisateur: true,
      inventaire: { where: { quantite: { gt: 0 } }, include: { objet: true }, orderBy: { objet: { nom: "asc" } } },
    },
    orderBy: { dateMort: "desc" },
  });
}

// Formulaire de fouille. Renvoie null si le formulaire n'est pas envoye ; texte seul (sans soumission) s'il n'y a aucun
// corps a fouiller, le clic n'ayant alors pas ouvert de formulaire.
export async function formulaireFouilleCorps(
  clic: ButtonInteraction,
  joueurId: number,
): Promise<{ soumission: ModalSubmitInteraction | null; texte: string } | null> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId } });
  const corps = (await corpsAuMemeEndroit(joueur)).slice(0, CORPS_MAX);
  if (corps.length === 0) return { soumission: null, texte: "Il n'y a plus aucun corps à fouiller ici." };

  const idFormulaire = `fouille-corps:${clic.id}`;
  await clic.showModal(
    new ModalBuilder()
      .setCustomId(idFormulaire)
      .setTitle("Fouiller un corps")
      .addLabelComponents(
        ...corps.map((c) => {
          const label = new LabelBuilder().setLabel(`Corps de ${nomJoueur(c)}`.slice(0, 45)).setStringSelectMenuComponent(
            new StringSelectMenuBuilder()
              .setCustomId(`corps-${c.id}`)
              .setRequired(corps.length === 1)
              .addOptions(
                c.inventaire.slice(0, OPTIONS_MAX).map((e) => ({
                  label: `${e.objet.nom} (× ${e.quantite})`.slice(0, 100),
                  value: String(e.objetId),
                  emoji: emojiObjet(e.objet.nom),
                })),
              ),
          );
          if (corps.length > 1) label.setDescription("Choisir un objet sur un seul des corps");
          return label;
        }),
        champQuantite(),
      ),
  );
  const soumission = await clic
    .awaitModalSubmit({ time: DELAI_FORMULAIRE_MS, filter: (i) => i.customId === idFormulaire })
    .catch(() => null);
  if (!soumission) return null;
  // Accuse reception tout de suite : le traitement peut depasser les 3 s laissees par Discord
  if (soumission.isFromMessage()) await soumission.deferUpdate();

  const choix = corps.flatMap((c) => soumission.fields.getStringSelectValues(`corps-${c.id}`).map((v) => ({ corpsId: c.id, objetId: Number(v) })));
  const quantite = lireQuantite(soumission);
  const texte =
    choix.length !== 1
      ? "Choisissez un seul objet, sur un seul corps."
      : quantite === null
        ? "La quantité doit être un nombre entier positif."
        : await fouillerCorps(clic.guild!, joueurId, choix[0].corpsId, choix[0].objetId, quantite);
  return { soumission, texte };
}

// Fouille confirmee : reverification (le corps doit toujours etre la, l'objet toujours dessus), puis transfert dans le
// sac, journal du joueur et mention dans le salon du lieu. Gratuit en PA.
async function fouillerCorps(guild: Guild, joueurId: number, corpsId: number, objetId: number, quantite: number): Promise<string> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true, utilisateur: true } });
  if (
    joueur.ville?.statut !== StatutVille.ACTIVE ||
    (joueur.statut !== StatutJoueur.VIVANT && joueur.statut !== StatutJoueur.EXCLU)
  ) {
    return "Vous ne pouvez plus fouiller de corps.";
  }
  if (joueur.rencontrePvZombie !== null) return "🧟 Un zombie vous attaque : impossible de fouiller un corps maintenant (`/action`).";
  const corps = (await corpsAuMemeEndroit(joueur)).find((c) => c.id === corpsId);
  if (!corps) return "Ce corps n'est plus là, ou il n'a plus rien sur lui.";
  const entree = corps.inventaire.find((e) => e.objetId === objetId);
  if (!entree || entree.quantite < quantite) {
    return `Le corps de **${nomJoueur(corps)}** n'a pas ${quantite} ${entree?.objet.nom ?? "de cet objet"} sur lui.`;
  }
  const charge = await chargeSac(joueurId);
  const poids = poidsObjet(entree.objet.nom) * quantite;
  if (deborde(charge, poids)) {
    return `Votre sac est trop lourd pour prendre ${quantite} ${emojiObjet(entree.objet.nom)} ${entree.objet.nom} (poids ${poids}, charge ${libelleCharge(charge)}).`;
  }

  const enVille = joueur.zoneActuelleId === null;
  const objet = `${emojiObjet(entree.objet.nom)} ${entree.objet.nom}`;
  await prisma.$transaction([
    prisma.inventaireJoueur.update({ where: { id: entree.id }, data: { quantite: { decrement: quantite } } }),
    prisma.inventaireJoueur.upsert({
      where: { joueurId_objetId: { joueurId, objetId } },
      update: { quantite: { increment: quantite } },
      create: { joueurId, objetId, quantite },
    }),
    prisma.journalEntree.create({
      data: {
        villeId: joueur.villeId!,
        joueurId,
        message: `Fouille du corps de ${nomJoueur(corps)} : ${objet} ×${quantite}`,
        public: enVille, // rien de public en territoire externe (conception.md §7)
      },
    }),
  ]);
  if (entree.objet.nom === OBJET_RADIO) await synchroniserAccesJoueur(guild, joueurId);

  const salon = await trouverSalonTexte(
    guild,
    enVille ? `salon:ville:${joueur.villeId}:place-publique` : `salon:zone:${joueur.zoneActuelleId}`,
  );
  await salon
    ?.send({
      content: `💀 <@${joueur.utilisateur.discordId}> fouille le corps de **${nomJoueur(corps)}** et prend **${objet} × ${quantite}**.`,
      allowedMentions: { parse: [] },
    })
    .catch(() => null);

  return `💀 Vous prenez **${objet} × ${quantite}** sur le corps de **${nomJoueur(corps)}**. C'est dans votre sac.`;
}
