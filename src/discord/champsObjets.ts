import { LabelBuilder, StringSelectMenuBuilder, TextInputBuilder, TextInputStyle, type ModalSubmitInteraction } from "discord.js";
import { emojiObjet } from "../config/objets";

// Champs de formulaire pour choisir un objet parmi ceux qu'on possede (sac ou banque de ville) et une quantite.
// Un menu Discord ne tient que 25 options : au-dela, les objets sont repartis sur plusieurs menus, un seul a remplir.

const OPTIONS_MAX = 25;

export interface ObjetPossede {
  objetId: number;
  quantite: number;
  objet: { nom: string };
}

export function champsObjetsPossedes(entrees: ObjetPossede[], libelle = "Quel objet ?"): LabelBuilder[] {
  const champs: LabelBuilder[] = [];
  for (let debut = 0; debut < entrees.length; debut += OPTIONS_MAX) {
    const tranche = entrees.slice(debut, debut + OPTIONS_MAX);
    const label = new LabelBuilder()
      .setLabel(entrees.length > OPTIONS_MAX ? `${libelle} (${tranche[0].objet.nom.charAt(0)}–${tranche[tranche.length - 1].objet.nom.charAt(0)})` : libelle)
      .setStringSelectMenuComponent(
        new StringSelectMenuBuilder()
          .setCustomId(`objet-${champs.length}`)
          .setRequired(entrees.length <= OPTIONS_MAX)
          .addOptions(
            tranche.map((e) => ({
              label: `${e.objet.nom} (× ${e.quantite})`.slice(0, 100),
              value: String(e.objetId),
              emoji: emojiObjet(e.objet.nom),
            })),
          ),
      );
    if (entrees.length > OPTIONS_MAX) label.setDescription("Choisir un objet dans une seule des listes");
    champs.push(label);
  }
  return champs;
}

// Objet choisi dans les listes de champsObjetsPossedes : null si aucune ou plusieurs listes remplies
export function lireObjetPossede(soumission: ModalSubmitInteraction, nombreListes: number): number | null {
  const choix: string[] = [];
  for (let i = 0; i < nombreListes; i++) choix.push(...soumission.fields.getStringSelectValues(`objet-${i}`));
  return choix.length === 1 ? Number(choix[0]) : null;
}

export function champQuantite(): LabelBuilder {
  return new LabelBuilder()
    .setLabel("Combien ?")
    .setTextInputComponent(
      new TextInputBuilder().setCustomId("quantite").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(4).setPlaceholder("1"),
    );
}

// Quantite saisie (vide = 1) ; null si ce n'est pas un entier positif
export function lireQuantite(soumission: ModalSubmitInteraction): number | null {
  const saisie = soumission.fields.getTextInputValue("quantite").trim();
  const quantite = saisie === "" ? 1 : Number(saisie);
  return Number.isInteger(quantite) && quantite > 0 ? quantite : null;
}
