import { StatutJoueur, StatutVille } from "@prisma/client";
import {
  LabelBuilder,
  ModalBuilder,
  StringSelectMenuBuilder,
  type ButtonInteraction,
  type Guild,
  type ModalSubmitInteraction,
} from "discord.js";
import { emojiObjet } from "../config/objets";
import { PV_MAX } from "../config/sante";
import { SOINS, soinsPossibles, type Soin } from "../config/soins";
import { prisma } from "../db";
import { coutSelonPhase } from "../game/deplacement";
import { calculerPaMax } from "../game/pa";
import { survivantsAuMemeEndroit } from "../services/voisins";
import { trouverSalonTexte } from "./reconcile";
import { verrouille } from "../services/verrou";

// Bouton « Soigner » de /action (equilibrage.md §1 et §4) : un formulaire unique (soin + qui soigner), puis le soin.
// Sur soi ou sur un survivant au meme endroit ; les PV rendus font remonter le PA max effectif du soigne.

const DELAI_FORMULAIRE_MS = 120_000;
const CIBLE_SOI = "soi";

function nomJoueur(joueur: { utilisateur: { discordId: string; pseudoCache: string | null } }): string {
  return joueur.utilisateur.pseudoCache ?? joueur.utilisateur.discordId;
}

// « 1 🩹 Bandage + 1 🌿 Plante médicinale »
function libelleIngredients(soin: Soin): string {
  return soin.ingredients.map((i) => `${i.quantite} ${emojiObjet(i.nom)} ${i.nom}`).join(" + ");
}

async function contenuSac(joueurId: number): Promise<Map<string, number>> {
  const sac = await prisma.inventaireJoueur.findMany({ where: { joueurId, quantite: { gt: 0 } }, include: { objet: true } });
  return new Map(sac.map((e) => [e.objet.nom, e.quantite]));
}

function manquants(soin: Soin, sac: Map<string, number>): string[] {
  return soin.ingredients
    .filter((i) => (sac.get(i.nom) ?? 0) < i.quantite)
    .map((i) => `${i.quantite - (sac.get(i.nom) ?? 0)} ${emojiObjet(i.nom)} ${i.nom}`);
}

// Formulaire du soin. Renvoie null si le formulaire n'est pas envoye ; texte seul (sans soumission) si aucun soin
// n'est possible, le clic n'ayant alors pas ouvert de formulaire.
export async function formulaireSoin(
  clic: ButtonInteraction,
  joueurId: number,
): Promise<{ soumission: ModalSubmitInteraction | null; texte: string } | null> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true } });
  const sac = await contenuSac(joueurId);
  const soins = soinsPossibles(joueur.metier);
  if (soins.every((s) => manquants(s, sac).length > 0)) {
    return {
      soumission: null,
      texte:
        "Vous n'avez rien pour soigner. Il faut au moins " +
        soins.map((s) => `${libelleIngredients(s)} (${s.libelle.toLowerCase()})`).join(", ou ") +
        " dans votre sac.",
    };
  }

  const phase = joueur.ville!.phaseActuelle;
  const voisins = await survivantsAuMemeEndroit(joueur, 24); // + « moi-meme » : 25 options au plus
  const idFormulaire = `soin:${clic.id}`;
  await clic.showModal(
    new ModalBuilder()
      .setCustomId(idFormulaire)
      .setTitle("Soigner")
      .addLabelComponents(
        new LabelBuilder().setLabel("Quel soin ?").setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId("soin")
            .setRequired(true)
            .addOptions(
              soins.map((s) => ({
                label: s.gueritInfection
                  ? `${s.libelle} : guérit l'infection`
                  : `${s.libelle} : +${s.pv} PV, ${coutSelonPhase(s.coutJour, phase)} PA`,
                value: s.id,
                description: `${libelleIngredients(s)}${manquants(s, sac).length > 0 ? " — il vous en manque" : ""}`.slice(0, 100),
              })),
            ),
        ),
        new LabelBuilder().setLabel("Qui soigner ?").setStringSelectMenuComponent(
          new StringSelectMenuBuilder()
            .setCustomId("cible")
            .setRequired(true)
            .addOptions(
              { label: `Moi-même (${joueur.pv} / ${PV_MAX} PV)`, value: CIBLE_SOI },
              ...voisins.map((v) => ({ label: `${nomJoueur(v)} (${v.pv} / ${PV_MAX} PV)`.slice(0, 100), value: String(v.id) })),
            ),
        ),
      ),
  );
  const soumission = await clic
    .awaitModalSubmit({ time: DELAI_FORMULAIRE_MS, filter: (i) => i.customId === idFormulaire })
    .catch(() => null);
  if (!soumission) return null;
  // Accuse reception tout de suite : le traitement peut depasser les 3 s laissees par Discord
  if (soumission.isFromMessage()) await soumission.deferUpdate();

  const soin = SOINS.find((s) => s.id === soumission.fields.getStringSelectValues("soin")[0]);
  const cible = soumission.fields.getStringSelectValues("cible")[0];
  const texte = soin ? await soigner(clic.guild!, joueurId, soin, cible === CIBLE_SOI ? joueurId : Number(cible)) : "Choisissez un soin.";
  return { soumission, texte };
}

// Soin valide : reverification (metier, PA, ingredients, soigne toujours au meme endroit et blesse), puis PA et
// ingredients depenses, PV rendus (plafond 10), journal, et annonce dans le salon du lieu si on soigne quelqu'un d'autre.
const soigner = verrouille(async function soigner(guild: Guild, joueurId: number, soin: Soin, cibleId: number): Promise<string> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true, utilisateur: true } });
  if (
    joueur.ville?.statut !== StatutVille.ACTIVE ||
    (joueur.statut !== StatutJoueur.VIVANT && joueur.statut !== StatutJoueur.EXCLU)
  ) {
    return "Vous ne pouvez plus soigner.";
  }
  if (soin.metier !== undefined && soin.metier !== joueur.metier) return `Le ${soin.libelle.toLowerCase()} est réservé au médecin.`;

  const soi = cibleId === joueurId;
  const cible = soi ? joueur : (await survivantsAuMemeEndroit(joueur)).find((v) => v.id === cibleId);
  if (!cible) return "Ce survivant n'est plus à côté de vous.";
  const qui = soi ? "Vous" : `**${nomJoueur(cible)}**`;
  if (soin.gueritInfection) return administrerRemede(guild, joueur, cible, soin);
  if (cible.pv >= PV_MAX) return `${qui} ${soi ? "êtes" : "est"} déjà en pleine santé (${PV_MAX} / ${PV_MAX} PV).`;

  const cout = coutSelonPhase(soin.coutJour, joueur.ville.phaseActuelle);
  const paRestants = (joueur.paActuel ?? 0) - cout;
  if (paRestants < 0) return `Il vous faut **${cout} PA** pour ce soin (vous en avez ${joueur.paActuel ?? 0}).`;
  const manque = manquants(soin, await contenuSac(joueurId));
  if (manque.length > 0) return `Il vous manque : ${manque.join(", ")}.`;

  const pv = Math.min(PV_MAX, cible.pv + soin.pv);
  const objets = await prisma.objet.findMany({ where: { nom: { in: soin.ingredients.map((i) => i.nom) } } });
  const enVille = joueur.zoneActuelleId === null;
  await prisma.$transaction([
    prisma.joueur.update({ where: { id: joueurId }, data: { paActuel: { decrement: cout } } }),
    prisma.joueur.update({ where: { id: cible.id }, data: { pv } }),
    ...soin.ingredients.map((i) =>
      prisma.inventaireJoueur.update({
        where: { joueurId_objetId: { joueurId, objetId: objets.find((o) => o.nom === i.nom)!.id } },
        data: { quantite: { decrement: i.quantite } },
      }),
    ),
    prisma.journalEntree.create({
      data: {
        villeId: joueur.villeId!,
        joueurId,
        message: `${soin.libelle} : ${soi ? "sur soi" : nomJoueur(cible)} (${cible.pv} → ${pv} PV)`,
        public: enVille, // rien de public en territoire externe (conception.md §7)
      },
    }),
    ...(!soi && cible.villeId !== null
      ? [
          prisma.journalEntree.create({
            data: { villeId: cible.villeId, joueurId: cible.id, message: `Soigné par ${nomJoueur(joueur)} (${cible.pv} → ${pv} PV)`, public: false },
          }),
        ]
      : []),
  ]);

  const paMaxAvant = calculerPaMax(cible).paMax;
  const paMaxApres = calculerPaMax({ ...cible, pv }).paMax;
  if (!soi) {
    const salon = await trouverSalonTexte(
      guild,
      enVille ? `salon:ville:${joueur.villeId}:place-publique` : `salon:zone:${joueur.zoneActuelleId}`,
    );
    await salon
      ?.send({
        content: `🩹 <@${joueur.utilisateur.discordId}> soigne <@${cible.utilisateur.discordId}> (+${pv - cible.pv} PV).`,
        allowedMentions: { users: [cible.utilisateur.discordId] },
      })
      .catch(() => null);
  }

  return (
    `🩹 ${soin.libelle} : ${soi ? "vous vous soignez" : `vous soignez **${nomJoueur(cible)}**`} avec ${libelleIngredients(soin)} ` +
    `(−${cout} PA, ${paRestants} restants).\n` +
    `PV ${cible.pv} → **${pv}** / ${PV_MAX}` +
    (paMaxApres !== paMaxAvant ? ` · PA max ${soi ? "" : "du soigné "}${paMaxAvant} → **${paMaxApres}**` : "")
  );
});

// Remede contre l'infection, administre par le medecin (equilibrage.md §8) : le joueur doit lui avoir dit qu'il est
// infecte. Le remede est consomme dans tous les cas ; si le soigne n'etait pas infecte, il est perdu.
const administrerRemede = verrouille(async function administrerRemede(
  guild: Guild,
  medecin: { id: number; villeId: number | null; zoneActuelleId: number | null; utilisateur: { discordId: string; pseudoCache: string | null } },
  cible: { id: number; villeId: number | null; infecteDepuis: Date | null; utilisateur: { discordId: string; pseudoCache: string | null } },
  soin: Soin,
): Promise<string> {
  const manque = manquants(soin, await contenuSac(medecin.id));
  if (manque.length > 0) return `Il vous manque : ${manque.join(", ")}.`;
  const soi = cible.id === medecin.id;
  const infecte = cible.infecteDepuis !== null;
  const objets = await prisma.objet.findMany({ where: { nom: { in: soin.ingredients.map((i) => i.nom) } } });
  await prisma.$transaction([
    ...soin.ingredients.map((i) =>
      prisma.inventaireJoueur.update({
        where: { joueurId_objetId: { joueurId: medecin.id, objetId: objets.find((o) => o.nom === i.nom)!.id } },
        data: { quantite: { decrement: i.quantite } },
      }),
    ),
    ...(infecte ? [prisma.joueur.update({ where: { id: cible.id }, data: { infecteDepuis: null, infusionJusqua: null } })] : []),
    prisma.journalEntree.create({
      data: {
        villeId: medecin.villeId!,
        joueurId: medecin.id,
        message: `Remède administré à ${soi ? "soi-même" : nomJoueur(cible)}${infecte ? "" : " (pas infecté, remède perdu)"}`,
        public: false,
      },
    }),
  ]);
  if (!soi) {
    const salon = await trouverSalonTexte(
      guild,
      medecin.zoneActuelleId === null ? `salon:ville:${medecin.villeId}:place-publique` : `salon:zone:${medecin.zoneActuelleId}`,
    );
    await salon
      ?.send({
        content: `💉 <@${medecin.utilisateur.discordId}> administre un remède à <@${cible.utilisateur.discordId}>.`,
        allowedMentions: { users: [cible.utilisateur.discordId] },
      })
      .catch(() => null);
  }
  const qui = soi ? "Vous" : `**${nomJoueur(cible)}**`;
  return infecte
    ? `💉 Le remède fait effet : ${qui} ${soi ? "êtes guéri" : "est guéri"} de l'infection.`
    : `❌ ${qui} ${soi ? "n'étiez" : "n'était"} pas infecté : le remède est perdu.`;
});
