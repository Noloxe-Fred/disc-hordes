import { TypeElection, type TypeBatiment, type Ville } from "@prisma/client";
import {
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type ButtonInteraction,
  type ModalSubmitInteraction,
} from "discord.js";
import { CHANTIERS, chantier } from "../config/batiments";
import { prisma } from "../db";
import { estMaireEnExercice } from "./annonce";
import { rafraichirPanneauChantiers } from "./chantiers";
import { ciblesPossibles, lancerSanction } from "./sanction";
import { posterDansMairie } from "./villeStructure";
import { attendreFormulaire } from "./formulaires";

// Pouvoirs du maire (conception.md §5), depuis le panneau « Maire » de /action : Annonce (discord/annonce.ts), Bannir et
// Executer (vote de la ville, discord/sanction.ts), Rationner et Prioriser un chantier. Rationnement et priorite sont
// purement informatifs : rien ne les fait respecter, mais ils sont annonces dans la mairie et rappeles sur le panneau
// des chantiers ; libre a la ville de bannir qui ne les respecte pas.

const DELAI_FORMULAIRE_MS = 300_000;
const LONGUEUR_MAX_MOTIF = 500;
const LONGUEUR_MAX_NOTE = 500;
const VALEUR_AUCUNE = "aucune";

type Resultat = { soumission: ModalSubmitInteraction; texte: string } | null;

async function ouvrirFormulaire(clic: ButtonInteraction, titre: string, champs: LabelBuilder[]): Promise<ModalSubmitInteraction | null> {
  const idFormulaire = `maire:${clic.id}`;
  await clic.showModal(new ModalBuilder().setCustomId(idFormulaire).setTitle(titre).addLabelComponents(...champs));
  const soumission = await attendreFormulaire(clic, idFormulaire, DELAI_FORMULAIRE_MS);
  // Accuse reception tout de suite : annonces et panneaux peuvent depasser les 3 s laissees par Discord
  if (soumission?.isFromMessage()) await soumission.deferUpdate();
  return soumission;
}

function champTexte(id: string, libelle: string, options: { description?: string; max?: number; paragraphe?: boolean; valeur?: string }) {
  const saisie = new TextInputBuilder()
    .setCustomId(id)
    .setStyle(options.paragraphe ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setRequired(false);
  if (options.max) saisie.setMaxLength(options.max);
  if (options.valeur) saisie.setValue(options.valeur);
  const label = new LabelBuilder().setLabel(libelle).setTextInputComponent(saisie);
  if (options.description) label.setDescription(options.description);
  return label;
}

async function maireDe(joueurId: number) {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true, utilisateur: true } });
  return estMaireEnExercice(joueur) ? joueur : null;
}

// --- Bannir / Executer : cible et motif, puis vote de la ville ---

// Renvoie le texte a afficher sans formulaire quand personne ne peut etre vise
export async function formulaireSanction(
  clic: ButtonInteraction,
  joueurId: number,
  type: typeof TypeElection.BANNISSEMENT | typeof TypeElection.EXECUTION,
): Promise<Resultat | { soumission: null; texte: string }> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId } });
  const cibles = await ciblesPossibles(joueur.villeId!, joueurId);
  if (cibles.length === 0) return { soumission: null, texte: "Aucun autre citoyen vivant dans la ville." };
  const bannir = type === TypeElection.BANNISSEMENT;
  const soumission = await ouvrirFormulaire(clic, bannir ? "Bannir un citoyen" : "Exécuter un citoyen", [
    new LabelBuilder()
      .setLabel("Quel citoyen ?")
      .setDescription("La ville vote jusqu'au changement de phase")
      .setStringSelectMenuComponent(
        new StringSelectMenuBuilder()
          .setCustomId("cible")
          .setRequired(true)
          .addOptions(
            cibles.slice(0, 25).map((c) => ({
              label: (c.utilisateur.pseudoCache ?? c.utilisateur.discordId).slice(0, 100),
              value: String(c.id),
            })),
          ),
      ),
    champTexte("motif", "Motif", { description: "Facultatif : affiché dans la mairie", max: LONGUEUR_MAX_MOTIF, paragraphe: true }),
  ]);
  if (!soumission) return null;
  const cibleId = Number(soumission.fields.getStringSelectValues("cible")[0]);
  const motif = soumission.fields.getTextInputValue("motif").trim();
  return { soumission, texte: await lancerSanction(clic.guild!, joueurId, type, cibleId, motif) };
}

// --- Rationnement (informatif) ---

// Portions par jour : vide = sans limite ; null si la saisie n'est pas un entier positif ou nul
function lirePortions(brut: string): number | null | undefined {
  const texte = brut.trim();
  if (texte === "") return null;
  if (!/^\d{1,3}$/.test(texte)) return undefined;
  return Number(texte);
}

export async function formulaireRationnement(clic: ButtonInteraction, joueurId: number): Promise<Resultat> {
  const actuelle = (await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true } })).ville!;
  const soumission = await ouvrirFormulaire(clic, "Rationnement", [
    new LabelBuilder().setLabel("Décision").setStringSelectMenuComponent(
      new StringSelectMenuBuilder()
        .setCustomId("decision")
        .setRequired(true)
        .addOptions(
          { label: "Rationner", value: "rationner", emoji: "🍽️", default: true },
          { label: "Lever le rationnement", value: "lever", emoji: "🔓" },
        ),
    ),
    champTexte("nourriture", "Nourriture : portions max par citoyen et par jour", {
      description: "Vide = sans limite",
      max: 3,
      valeur: actuelle.rationNourriture?.toString(),
    }),
    champTexte("eau", "Eau : portions max par citoyen et par jour", {
      description: "Vide = sans limite",
      max: 3,
      valeur: actuelle.rationEau?.toString(),
    }),
    champTexte("note", "Consigne", {
      description: "Facultatif : précisions pour la ville",
      max: LONGUEUR_MAX_NOTE,
      paragraphe: true,
      valeur: actuelle.rationNote ?? undefined,
    }),
  ]);
  if (!soumission) return null;

  const lever = soumission.fields.getStringSelectValues("decision")[0] === "lever";
  const nourriture = lirePortions(soumission.fields.getTextInputValue("nourriture"));
  const eau = lirePortions(soumission.fields.getTextInputValue("eau"));
  const note = soumission.fields.getTextInputValue("note").trim() || null;
  if (!lever && (nourriture === undefined || eau === undefined)) {
    return { soumission, texte: "Les portions doivent être des nombres entiers (ou vides pour ne pas limiter)." };
  }
  if (!lever && nourriture === null && eau === null && note === null) {
    return { soumission, texte: "Indiquez au moins une limite ou une consigne, ou choisissez « Lever le rationnement »." };
  }

  const maire = await maireDe(joueurId);
  if (!maire) return { soumission, texte: "Vous n'êtes plus maire." };
  const villeId = maire.villeId!;
  await prisma.ville.update({
    where: { id: villeId },
    data: lever
      ? { rationnementActif: false, rationNourriture: null, rationEau: null, rationNote: null }
      : { rationnementActif: true, rationNourriture: nourriture ?? null, rationEau: eau ?? null, rationNote: note },
  });
  await prisma.journalEntree.create({ data: { villeId, joueurId, message: lever ? "Rationnement levé" : "Rationnement décidé" } });
  const ville = await prisma.ville.findUniqueOrThrow({ where: { id: villeId } });
  const annonce = lever
    ? `🔓 Le maire <@${maire.utilisateur.discordId}> lève le rationnement.`
    : `🍽️ Le maire <@${maire.utilisateur.discordId}> décide un **rationnement** : ${texteRationnement(ville)}`;
  await posterDansMairie(clic.guild!, villeId, annonce, { mentionnerVille: true });
  await rafraichirPanneauChantiers(clic.guild!, villeId);
  return { soumission, texte: lever ? "🔓 Le rationnement est levé." : "🍽️ Le rationnement est annoncé dans la mairie et rappelé sur le panneau des chantiers." };
}

export function texteRationnement(ville: Pick<Ville, "rationNourriture" | "rationEau" | "rationNote">): string {
  const limite = (n: number | null, quoi: string) => (n === null ? `${quoi} sans limite` : `${n} portion${n > 1 ? "s" : ""} de ${quoi}`);
  return (
    `${limite(ville.rationNourriture, "nourriture")}, ${limite(ville.rationEau, "eau")} par citoyen et par jour.` +
    (ville.rationNote ? `\n> ${ville.rationNote.replace(/\n/g, "\n> ")}` : "")
  );
}

// --- Chantier prioritaire (informatif) ---

export async function formulairePriorite(clic: ButtonInteraction, joueurId: number): Promise<Resultat> {
  const { ville } = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true } });
  const soumission = await ouvrirFormulaire(clic, "Prioriser un chantier", [
    new LabelBuilder()
      .setLabel("Chantier prioritaire")
      .setDescription("Rappelé en tête du panneau des chantiers")
      .setStringSelectMenuComponent(
        new StringSelectMenuBuilder()
          .setCustomId("chantier")
          .setRequired(true)
          .addOptions(
            ...CHANTIERS.map((c) => ({ label: c.nom, value: c.type, emoji: c.emoji, default: ville!.chantierPrioritaire === c.type })),
            { label: "Aucune priorité", value: VALEUR_AUCUNE, emoji: "➖", default: ville!.chantierPrioritaire === null },
          ),
      ),
  ]);
  if (!soumission) return null;
  const choix = soumission.fields.getStringSelectValues("chantier")[0];
  const type = choix === VALEUR_AUCUNE ? null : (choix as TypeBatiment);

  const maire = await maireDe(joueurId);
  if (!maire) return { soumission, texte: "Vous n'êtes plus maire." };
  const villeId = maire.villeId!;
  await prisma.ville.update({ where: { id: villeId }, data: { chantierPrioritaire: type } });
  const nom = type ? `${chantier(type).emoji} **${chantier(type).nom}**` : null;
  await prisma.journalEntree.create({
    data: { villeId, joueurId, message: type ? `Chantier prioritaire : ${chantier(type).nom}` : "Plus de chantier prioritaire" },
  });
  await posterDansMairie(
    clic.guild!,
    villeId,
    nom
      ? `⭐ Le maire <@${maire.utilisateur.discordId}> fait du chantier ${nom} la **priorité** de la ville.`
      : `⭐ Le maire <@${maire.utilisateur.discordId}> retire la priorité des chantiers.`,
  );
  await rafraichirPanneauChantiers(clic.guild!, villeId);
  return { soumission, texte: nom ? `⭐ ${nom} est désormais le chantier prioritaire.` : "La priorité des chantiers est retirée." };
}
