import { StatutJoueur, StatutVille } from "@prisma/client";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  ModalBuilder,
  TextDisplayBuilder,
  type ButtonInteraction,
  type Guild,
  type ModalSubmitInteraction,
} from "discord.js";
import { emojiObjet, OBJET_RADIO, poidsObjet } from "../config/objets";
import { prisma } from "../db";
import { chargeBanque, chargeSac, deborde, libelleCharge } from "../services/charge";
import { champQuantite, champsObjetsPossedes, lireObjetPossede, lireQuantite } from "./champsObjets";
import { synchroniserAccesJoueur } from "./joueurDiscord";
import { rendreInventaire } from "./renduInventaire";

// Banque de ville (conception.md §1, inventaire de ville) : les citoyens vivants presents en ville y deposent des
// objets de leur sac ou en retirent, sans passer par le don. Gratuit en PA, inscrit au journal public de la ville.
// Capacite en poids selon le palier de la place publique, et celle du sac au retrait (equilibrage.md §5).

const COULEUR = 0x95a5a6;
const FICHIER_BANQUE = "banque.png";
const DELAI_FORMULAIRE_MS = 120_000;

export type SensBanque = "deposer" | "retirer";

function encadre(texte: string): ContainerBuilder {
  return new ContainerBuilder().setAccentColor(COULEUR).addTextDisplayComponents(new TextDisplayBuilder().setContent(texte));
}

// Conditions d'acces a la banque, verifiees a l'affichage puis a chaque operation ; null si tout va bien
export function empechementBanque(joueur: {
  statut: StatutJoueur;
  zoneActuelleId: number | null;
  ville: { statut: StatutVille } | null;
}): string | null {
  if (joueur.ville?.statut !== StatutVille.ACTIVE) return "Votre ville n'est pas encore fondée : elle n'a pas de banque.";
  if (joueur.statut !== StatutJoueur.VIVANT) return "Seuls les citoyens vivants ont accès à la banque de la ville.";
  if (joueur.zoneActuelleId !== null) return "Rentrez en ville pour accéder à la banque.";
  return null;
}

function contenuBanque(villeId: number) {
  return prisma.inventaireVille.findMany({
    where: { villeId, quantite: { gt: 0 } },
    include: { objet: true },
    orderBy: { objet: { nom: "asc" } },
  });
}

function contenuSac(joueurId: number) {
  return prisma.inventaireJoueur.findMany({
    where: { joueurId, quantite: { gt: 0 } },
    include: { objet: true },
    orderBy: { objet: { nom: "asc" } },
  });
}

// Ecran de la banque : son contenu en image, boutons « deposer » et « retirer », et le bouton retour fourni.
// message : resultat de la derniere operation, affiche en tete
export async function ecranBanque(
  joueurId: number,
  retour: ButtonBuilder,
  message?: string,
): Promise<{ conteneur: ContainerBuilder; fichiers: AttachmentBuilder[] }> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true } });
  const raison = empechementBanque(joueur);
  if (raison) {
    return {
      conteneur: encadre(message ? `${message}\n\n${raison}` : raison).addActionRowComponents(
        new ActionRowBuilder<ButtonBuilder>().addComponents(retour),
      ),
      fichiers: [],
    };
  }
  const ville = joueur.ville!;
  const [banque, charge, sac] = await Promise.all([contenuBanque(ville.id), chargeBanque(ville.id), chargeSac(joueurId)]);

  const png = rendreInventaire(`Banque — ${ville.nom}`, banque.map((e) => ({ ...e.objet, quantite: e.quantite })), { charge });
  const conteneur = encadre(
    (message ? `${message}\n\n` : "") +
      `## 🏦 Banque — ${ville.nom}\nRéserve à la disposition de tous les citoyens : 🏦 ${libelleCharge(charge)} · 🎒 votre sac ${libelleCharge(sac)}.`,
  )
    .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${FICHIER_BANQUE}`)))
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        banque.length > 0 ? `-# ${banque.map((e) => `${emojiObjet(e.objet.nom)} ${e.objet.nom} ×${e.quantite}`).join(" · ")}` : "-# La banque est vide.",
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("deposer").setLabel("Déposer").setEmoji("📥").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId("retirer").setLabel("Retirer").setEmoji("📤").setStyle(ButtonStyle.Secondary),
        retour,
      ),
    );
  return { conteneur, fichiers: [new AttachmentBuilder(png, { name: FICHIER_BANQUE })] };
}

// Formulaire de depot ou de retrait (objet + quantite), puis operation. Renvoie null si le formulaire n'est pas
// envoye ; texte seul (sans soumission) si rien n'est possible, le clic n'ayant alors pas ouvert de formulaire.
export async function formulaireBanque(
  clic: ButtonInteraction,
  joueurId: number,
  sens: SensBanque,
): Promise<{ soumission: ModalSubmitInteraction | null; texte: string } | null> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true } });
  const raison = empechementBanque(joueur);
  if (raison) return { soumission: null, texte: raison };
  const entrees = sens === "deposer" ? await contenuSac(joueurId) : await contenuBanque(joueur.villeId!);
  if (entrees.length === 0) {
    return { soumission: null, texte: sens === "deposer" ? "Votre sac est vide : rien à déposer." : "La banque est vide : rien à retirer." };
  }

  const champs = champsObjetsPossedes(entrees);
  const idFormulaire = `banque:${clic.id}`;
  await clic.showModal(
    new ModalBuilder()
      .setCustomId(idFormulaire)
      .setTitle(sens === "deposer" ? "Déposer à la banque" : "Retirer de la banque")
      .addLabelComponents(...champs, champQuantite()),
  );
  const soumission = await clic
    .awaitModalSubmit({ time: DELAI_FORMULAIRE_MS, filter: (i) => i.customId === idFormulaire })
    .catch(() => null);
  if (!soumission) return null;

  const objetId = lireObjetPossede(soumission, champs.length);
  const quantite = lireQuantite(soumission);
  const texte =
    objetId === null
      ? "Choisissez un seul objet."
      : quantite === null
        ? "La quantité doit être un nombre entier positif."
        : await operer(clic.guild!, joueurId, sens, objetId, quantite);
  return { soumission, texte };
}

// Depot ou retrait : reverification (le joueur doit etre toujours en ville, l'objet toujours disponible), puis
// transfert entre le sac et la banque, et entree au journal public de la ville.
async function operer(guild: Guild, joueurId: number, sens: SensBanque, objetId: number, quantite: number): Promise<string> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true } });
  const raison = empechementBanque(joueur);
  if (raison) return raison;
  const villeId = joueur.villeId!;
  const objet = await prisma.objet.findUniqueOrThrow({ where: { id: objetId } });
  const nom = `${emojiObjet(objet.nom)} ${objet.nom}`;

  const source =
    sens === "deposer"
      ? await prisma.inventaireJoueur.findUnique({ where: { joueurId_objetId: { joueurId, objetId } } })
      : await prisma.inventaireVille.findUnique({ where: { villeId_objetId: { villeId, objetId } } });
  if (!source || source.quantite < quantite) {
    return sens === "deposer"
      ? `Vous n'avez pas ${quantite} ${nom} sur vous.`
      : `La banque n'a plus ${quantite} ${nom} (il en reste ${source?.quantite ?? 0}).`;
  }

  // La destination doit avoir la place : la banque au depot, le sac au retrait
  const poids = poidsObjet(objet.nom) * quantite;
  const destination = sens === "deposer" ? await chargeBanque(villeId) : await chargeSac(joueurId);
  if (deborde(destination, poids)) {
    return (
      (sens === "deposer" ? "La banque est trop pleine" : "Votre sac est trop lourd") +
      ` pour ${quantite} ${nom} (poids ${poids}, charge ${libelleCharge(destination)}).`
    );
  }

  const sac = { where: { joueurId_objetId: { joueurId, objetId } } };
  const banque = { where: { villeId_objetId: { villeId, objetId } } };
  await prisma.$transaction([
    sens === "deposer"
      ? prisma.inventaireJoueur.update({ ...sac, data: { quantite: { decrement: quantite } } })
      : prisma.inventaireVille.update({ ...banque, data: { quantite: { decrement: quantite } } }),
    sens === "deposer"
      ? prisma.inventaireVille.upsert({ ...banque, update: { quantite: { increment: quantite } }, create: { villeId, objetId, quantite } })
      : prisma.inventaireJoueur.upsert({ ...sac, update: { quantite: { increment: quantite } }, create: { joueurId, objetId, quantite } }),
    prisma.journalEntree.create({
      data: {
        villeId,
        joueurId,
        message: `${sens === "deposer" ? "Dépôt à la banque" : "Retrait de la banque"} : ${objet.nom} ×${quantite}`,
      },
    }),
  ]);
  if (objet.nom === OBJET_RADIO) await synchroniserAccesJoueur(guild, joueurId);

  return sens === "deposer"
    ? `📥 Vous avez déposé **${nom} × ${quantite}** à la banque de la ville.`
    : `📤 Vous avez retiré **${nom} × ${quantite}** de la banque de la ville.`;
}
