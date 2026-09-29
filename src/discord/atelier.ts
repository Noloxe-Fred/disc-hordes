import { StatutJoueur, StatutVille, TypeBatiment, TypeObjet, type Metier } from "@prisma/client";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  type Guild,
} from "discord.js";
import { NOM_METIER } from "../config/metiers";
import { CAPACITE_SAC, emojiObjet, poidsObjet } from "../config/objets";
import { SEUIL_CRITIQUE_FAIM_SOIF } from "../config/sante";
import { prisma } from "../db";
import { deborde, libelleCharge, poidsTotal } from "../services/charge";
import { trouverSalonTexte } from "./reconcile";

// Craft avance (equilibrage.md §8) : dans le salon « atelier » de la ville, qui n'existe qu'une fois l'atelier construit
// (discord/villeStructure.ts), le bouton « Craft avancé » de /inventaire propose les recettes exclusives du metier du
// joueur. Ingredients pris dans le sac, puis completes par la banque de ville ; cout en PA de la recette (identique la
// nuit, craft en ville uniquement). Bloque sous le seuil critique de faim ou de soif.

const COULEUR = 0x95a5a6;

export async function palierAtelier(villeId: number): Promise<number> {
  const atelier = await prisma.batimentVille.findUnique({ where: { villeId_type: { villeId, type: TypeBatiment.ATELIER } } });
  return atelier?.palierActuel ?? 0;
}

// /inventaire lance depuis le salon atelier de sa ville, par un citoyen vivant en ville
export async function estDansAtelier(
  guild: Guild,
  salonId: string | null,
  joueur: { statut: StatutJoueur; zoneActuelleId: number | null; villeId: number | null; ville: { statut: StatutVille } | null },
): Promise<boolean> {
  if (!salonId || joueur.villeId === null || joueur.ville?.statut !== StatutVille.ACTIVE) return false;
  if (joueur.statut !== StatutJoueur.VIVANT || joueur.zoneActuelleId !== null) return false;
  const salon = await trouverSalonTexte(guild, `salon:ville:${joueur.villeId}:atelier`);
  return salon?.id === salonId && (await palierAtelier(joueur.villeId)) >= 1;
}

async function recettesDuMetier(metier: Metier | null, palier: number) {
  if (!metier) return [];
  return prisma.recette.findMany({
    where: {
      objetResultat: { type: TypeObjet.CRAFT_AVANCE },
      metierExclusif: metier,
      OR: [{ palierAtelierRequis: null }, { palierAtelierRequis: { lte: palier } }],
    },
    include: { objetResultat: true, ingredients: { include: { objet: true } } },
    orderBy: { objetResultat: { nom: "asc" } },
  });
}
export type RecetteAvancee = Awaited<ReturnType<typeof recettesDuMetier>>[number];

// Quantites disponibles pour le joueur : sac + banque de sa ville
async function disponibles(joueurId: number, villeId: number): Promise<{ sac: Map<number, number>; banque: Map<number, number> }> {
  const [sac, banque] = await Promise.all([
    prisma.inventaireJoueur.findMany({ where: { joueurId, quantite: { gt: 0 } } }),
    prisma.inventaireVille.findMany({ where: { villeId, quantite: { gt: 0 } } }),
  ]);
  return { sac: new Map(sac.map((e) => [e.objetId, e.quantite])), banque: new Map(banque.map((e) => [e.objetId, e.quantite])) };
}

function manquants(recette: RecetteAvancee, stock: { sac: Map<number, number>; banque: Map<number, number> }): string[] {
  return recette.ingredients
    .map((i) => ({ i, dispo: (stock.sac.get(i.objetId) ?? 0) + (stock.banque.get(i.objetId) ?? 0) }))
    .filter(({ i, dispo }) => dispo < i.quantite)
    .map(({ i, dispo }) => `${i.quantite - dispo} ${emojiObjet(i.objet.nom)} ${i.objet.nom}`);
}

function libelleIngredients(recette: RecetteAvancee): string {
  return recette.ingredients.map((i) => `${i.quantite} ${emojiObjet(i.objet.nom)} ${i.objet.nom}`).join(" + ");
}

function encadre(texte: string): ContainerBuilder {
  return new ContainerBuilder().setAccentColor(COULEUR).addTextDisplayComponents(new TextDisplayBuilder().setContent(texte));
}

// Ecran de choix de la recette (select « recette-avancee ») ; renvoie aussi les recettes pour la suite
export async function ecranCraftAvance(joueurId: number, entete: string, retour: ButtonBuilder) {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId } });
  const recettes = await recettesDuMetier(joueur.metier, await palierAtelier(joueur.villeId!));
  const ligneRetour = new ActionRowBuilder<ButtonBuilder>().addComponents(retour);
  if (recettes.length === 0) {
    const metier = joueur.metier ? NOM_METIER[joueur.metier] : "sans métier";
    return {
      recettes,
      ecran: encadre(`${entete}\n\n🛠️ Aucune recette avancée pour votre métier (${metier}).`).addActionRowComponents(ligneRetour),
    };
  }
  const stock = await disponibles(joueurId, joueur.villeId!);
  const ecran = encadre(`${entete}\n**Craft avancé** : ingrédients pris dans votre sac, puis dans la banque de la ville.`)
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("recette-avancee")
          .setPlaceholder("Recette…")
          .addOptions(
            recettes.map((r) => ({
              label: r.objetResultat.nom,
              value: String(r.id),
              emoji: emojiObjet(r.objetResultat.nom),
              description: `${libelleIngredients(r)} · ${r.coutPA ?? 0} PA${manquants(r, stock).length > 0 ? " — il manque des ingrédients" : ""}`.slice(0, 100),
            })),
          ),
      ),
    )
    .addActionRowComponents(ligneRetour);
  return { recettes, ecran };
}

// Ecran de confirmation (bouton « confirmer-avance ») ou raison pour laquelle la recette est impossible
export async function ecranConfirmationAvance(joueurId: number, recette: RecetteAvancee, entete: string, retour: ButtonBuilder) {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId } });
  const cout = recette.coutPA ?? 0;
  const manque = manquants(recette, await disponibles(joueurId, joueur.villeId!));
  const nom = `${emojiObjet(recette.objetResultat.nom)} ${recette.objetResultat.nom}`;
  if (manque.length > 0 || (joueur.paActuel ?? 0) < cout) {
    return encadre(
      `${entete}\n\n**${nom}** demande ${libelleIngredients(recette)} et **${cout} PA**.\n` +
        (manque.length > 0 ? `Il manque (sac + banque) : ${manque.join(", ")}.` : `Vous n'avez que ${joueur.paActuel ?? 0} PA.`),
    ).addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(retour));
  }
  return encadre(`${entete}\n\nFabriquer **${nom}** avec ${libelleIngredients(recette)} pour **${cout} PA** ?`).addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId("confirmer-avance").setLabel(`Fabriquer (${cout} PA)`).setStyle(ButtonStyle.Primary),
      retour,
    ),
  );
}

// Fabrication confirmee : reverification complete, ingredients pris dans le sac puis la banque, objet ajoute au sac
export async function fabriquerAvance(guild: Guild, salonId: string | null, joueurId: number, recetteId: number): Promise<string> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true } });
  if (!(await estDansAtelier(guild, salonId, joueur))) return "Le craft avancé se fait dans le salon atelier de votre ville, en ville.";
  if (joueur.faim < SEUIL_CRITIQUE_FAIM_SOIF || joueur.soif < SEUIL_CRITIQUE_FAIM_SOIF) {
    return "Vous êtes trop affamé ou assoiffé pour travailler à l'atelier (faim et soif doivent être d'au moins 10).";
  }
  const villeId = joueur.villeId!;
  const recette = (await recettesDuMetier(joueur.metier, await palierAtelier(villeId))).find((r) => r.id === recetteId);
  if (!recette) return "Cette recette n'est pas celle de votre métier.";
  const cout = recette.coutPA ?? 0;
  if ((joueur.paActuel ?? 0) < cout) return `Il vous faut **${cout} PA** pour cette recette.`;
  const stock = await disponibles(joueurId, villeId);
  const manque = manquants(recette, stock);
  if (manque.length > 0) return `Il manque (sac + banque) : ${manque.join(", ")}.`;

  // Part prise dans le sac, le reste dans la banque
  const parts = recette.ingredients.map((i) => {
    const duSac = Math.min(i.quantite, stock.sac.get(i.objetId) ?? 0);
    return { i, duSac, deLaBanque: i.quantite - duSac };
  });
  const sac = await prisma.inventaireJoueur.findMany({ where: { joueurId, quantite: { gt: 0 } }, include: { objet: true } });
  const charge = { utilisee: poidsTotal(sac), capacite: CAPACITE_SAC };
  const ajout = poidsObjet(recette.objetResultat.nom) - parts.reduce((s, p) => s + p.duSac * poidsObjet(p.i.objet.nom), 0);
  const nom = `${emojiObjet(recette.objetResultat.nom)} ${recette.objetResultat.nom}`;
  if (deborde(charge, ajout)) return `Votre sac est trop lourd pour recevoir ${nom} (charge ${libelleCharge(charge)}) : déposez d'abord des objets.`;

  await prisma.$transaction([
    prisma.joueur.update({ where: { id: joueurId }, data: { paActuel: { decrement: cout } } }),
    ...parts.flatMap((p) => [
      ...(p.duSac > 0
        ? [prisma.inventaireJoueur.update({ where: { joueurId_objetId: { joueurId, objetId: p.i.objetId } }, data: { quantite: { decrement: p.duSac } } })]
        : []),
      ...(p.deLaBanque > 0
        ? [prisma.inventaireVille.update({ where: { villeId_objetId: { villeId, objetId: p.i.objetId } }, data: { quantite: { decrement: p.deLaBanque } } })]
        : []),
    ]),
    prisma.inventaireJoueur.upsert({
      where: { joueurId_objetId: { joueurId, objetId: recette.objetResultatId } },
      update: { quantite: { increment: 1 } },
      create: { joueurId, objetId: recette.objetResultatId, quantite: 1 },
    }),
    prisma.journalEntree.create({ data: { villeId, joueurId, message: `Atelier : ${recette.objetResultat.nom}` } }),
  ]);
  const banque = parts.filter((p) => p.deLaBanque > 0).map((p) => `${p.deLaBanque} ${p.i.objet.nom}`);
  return (
    `🛠️ Vous fabriquez **${nom}** à l'atelier (−${cout} PA, ${(joueur.paActuel ?? 0) - cout} restants). Il est dans votre sac.` +
    (banque.length > 0 ? `\n🏦 Pris à la banque : ${banque.join(", ")}.` : "")
  );
}
