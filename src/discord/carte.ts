import { StatutJoueur, StatutVille } from "@prisma/client";
import {
  ActionRowBuilder,
  AttachmentBuilder,
  ButtonBuilder,
  ButtonStyle,
  ContainerBuilder,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  type Guild,
} from "discord.js";
import { prisma } from "../db";
import { ajouterACarte, citoyensDehors, grilleCarte, zonesDecouvertes } from "../services/carte";
import { trouverSalonTexte } from "./reconcile";
import { rendreCarte } from "./renduCarte";

// Ecrans « Carte » et « Partager la carte » du menu /action (conception.md §1 et §4).
// - Carte : image de la carte individuelle, avec la position des concitoyens hors les murs (jamais celle des
//   joueurs des autres villes, ni des joueurs en ville).
// - Partage : en ville, vers un ou plusieurs citoyens vivants de sa ville (ou tous), gratuit en PA. Les
//   destinataires recoivent les zones qu'ils ne connaissaient pas ; le partage est annonce sur la place publique.

const COULEUR = 0xc8a165;
const FICHIER_CARTE = "carte.png";

function encadre(texte: string): ContainerBuilder {
  return new ContainerBuilder().setAccentColor(COULEUR).addTextDisplayComponents(new TextDisplayBuilder().setContent(texte));
}

function nomJoueur(joueur: { utilisateur: { discordId: string; pseudoCache: string | null } }): string {
  return joueur.utilisateur.pseudoCache ?? joueur.utilisateur.discordId;
}

// --- Carte ---

export async function ecranCarte(
  joueurId: number,
  retour: ButtonBuilder,
): Promise<{ conteneur: ContainerBuilder; fichiers: AttachmentBuilder[] }> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true } });
  const ville = joueur.ville!;
  const [grille, dehors] = await Promise.all([
    grilleCarte(ville.groupeId!, joueurId, joueur.zoneActuelleId),
    citoyensDehors(ville.id, joueurId),
  ]);

  const citoyensParZone = new Map<number, number>();
  for (const c of dehors) citoyensParZone.set(c.zoneActuelleId!, (citoyensParZone.get(c.zoneActuelleId!) ?? 0) + 1);
  const png = rendreCarte({ nomVille: ville.nom, enVille: joueur.zoneActuelleId === null, grille, citoyensParZone });

  const cases = grille.flatMap((ligne) => ligne.cases);
  const connues = cases.filter((c) => c.decouverte || c.ici).length;
  const texte =
    `## 🗺️ Carte — ${ville.nom}\n` +
    `${connues} / ${cases.length} zones découvertes\n` +
    (dehors.length > 0
      ? `🔵 **Citoyens dehors** : ${dehors.map((c) => `${nomJoueur(c)} (${c.zoneActuelle!.nom})`).join(", ")}`
      : "🔵 Aucun autre citoyen hors de la ville.");

  const conteneur = encadre(texte)
    .addMediaGalleryComponents(
      new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${FICHIER_CARTE}`)),
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
        "-# Cercle doré : vous · zones pointillées : inconnues · points bleus : vos concitoyens. " +
          "Les liens suivent les anneaux (zones de même distance) et les rayons (même type de zone).",
      ),
    )
    .addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(retour));

  return { conteneur, fichiers: [new AttachmentBuilder(png, { name: FICHIER_CARTE })] };
}

// --- Partage ---

// Conditions pour partager, verifiees a l'affichage du bouton puis au moment du partage ; null si tout va bien
export function empechementPartage(joueur: {
  statut: StatutJoueur;
  zoneActuelleId: number | null;
  ville: { statut: StatutVille } | null;
}): string | null {
  if (joueur.ville?.statut !== StatutVille.ACTIVE) return "Votre ville n'est pas encore fondée : il n'y a rien à cartographier.";
  if (joueur.statut !== StatutJoueur.VIVANT) return "Seuls les citoyens vivants en ville peuvent partager leur carte.";
  if (joueur.zoneActuelleId !== null) return "Rentrez en ville pour partager votre carte avec les autres citoyens.";
  return null;
}

// Ecran de choix des destinataires : menu « destinataires » (choix multiple) et bouton « toute-la-ville »
export async function ecranPartage(joueurId: number, retour: ButtonBuilder): Promise<ContainerBuilder> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true } });
  const ligneRetour = new ActionRowBuilder<ButtonBuilder>().addComponents(retour);
  const raison = empechementPartage(joueur);
  if (raison) return encadre(raison).addActionRowComponents(ligneRetour);

  const nbZones = (await zonesDecouvertes(joueurId)).length;
  if (nbZones === 0) {
    return encadre("Votre carte est vide : explorez les territoires externes avant de la partager.").addActionRowComponents(ligneRetour);
  }

  // 15 habitants maximum par ville : la liste tient toujours dans un menu (25 options)
  const citoyens = await prisma.joueur.findMany({
    where: { villeId: joueur.villeId, statut: StatutJoueur.VIVANT, dateSortie: null, id: { not: joueurId } },
    include: { utilisateur: true },
    orderBy: { id: "asc" },
    take: 25,
  });
  if (citoyens.length === 0) {
    return encadre("Aucun autre citoyen vivant avec qui partager votre carte.").addActionRowComponents(ligneRetour);
  }

  return encadre(`## 🤝 Partager votre carte\nVous connaissez **${nbZones} zone(s)**. Avec qui les partager ?`)
    .addActionRowComponents(
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("destinataires")
          .setPlaceholder("Choisir des citoyens…")
          .setMinValues(1)
          .setMaxValues(citoyens.length)
          .addOptions(
            citoyens.map((c) => ({
              label: nomJoueur(c).slice(0, 100),
              value: String(c.id),
              description: c.zoneActuelleId === null ? "En ville" : "En territoire externe",
            })),
          ),
      ),
    )
    .addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder().setCustomId("toute-la-ville").setLabel("Toute la ville").setEmoji("📣").setStyle(ButtonStyle.Primary),
        retour,
      ),
    );
}

// Partage effectif ; destinataireIds null = tous les citoyens vivants de la ville. Renvoie le texte a afficher.
export async function partagerCarte(guild: Guild, joueurId: number, destinataireIds: number[] | null): Promise<string> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { ville: true, utilisateur: true } });
  const raison = empechementPartage(joueur);
  if (raison) return raison;
  const ville = joueur.ville!;

  const destinataires = await prisma.joueur.findMany({
    where: {
      villeId: ville.id,
      statut: StatutJoueur.VIVANT,
      dateSortie: null,
      id: destinataireIds ? { in: destinataireIds.filter((id) => id !== joueurId) } : { not: joueurId },
    },
    include: { utilisateur: true },
  });
  if (destinataires.length === 0) return "Ces citoyens ne peuvent plus recevoir votre carte.";

  const zoneIds = await zonesDecouvertes(joueurId);
  const bilans: string[] = [];
  for (const destinataire of destinataires) {
    const nouvelles = await ajouterACarte(destinataire.id, zoneIds);
    bilans.push(`• **${nomJoueur(destinataire)}** : ${nouvelles > 0 ? `${nouvelles} nouvelle(s) zone(s)` : "rien de nouveau"}`);
    await prisma.journalEntree.create({
      data: {
        villeId: ville.id,
        joueurId: destinataire.id,
        message: `Carte reçue de ${nomJoueur(joueur)}${nouvelles > 0 ? ` (+${nouvelles} zone(s))` : ""}`,
        public: false,
      },
    });
  }
  await prisma.journalEntree.create({
    data: { villeId: ville.id, joueurId, message: `Carte partagée avec ${destinataires.map(nomJoueur).join(", ")}` },
  });

  const salon = await trouverSalonTexte(guild, `salon:ville:${ville.id}:place-publique`);
  await salon
    ?.send({
      content: `🗺️ <@${joueur.utilisateur.discordId}> a partagé sa carte avec ${destinataires.map((d) => `<@${d.utilisateur.discordId}>`).join(", ")}.`,
      allowedMentions: { users: destinataires.map((d) => d.utilisateur.discordId) },
    })
    .catch(() => null);

  return `## 🤝 Carte partagée\n${bilans.join("\n")}`;
}
