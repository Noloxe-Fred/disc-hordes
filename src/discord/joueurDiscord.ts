import { StatutJoueur, StatutVille, TypeRessourceDiscord } from "@prisma/client";
import { ChannelType, PermissionFlagsBits, type Guild, type GuildMember, type TextChannel, type VoiceChannel } from "discord.js";
import { OBJET_RADIO } from "../config/objets";
import { prisma } from "../db";
import { trouverRole, trouverSalonTexte } from "./reconcile";
import { ROLE_CITOYEN, ROLE_MORT, ROLE_NOMADE, ROLE_RADIO } from "./structure";
import { ensureSalonRadio } from "./territoires";

// Acces Discord d'un joueur a sa ville et aux ondes radio de son groupe (conception.md §1 et §3), recalcule en entier
// par synchroniserAccesJoueur a chaque changement de situation (deplacement, mort, exclusion, retour a la vie,
// radio gagnee ou perdue) : une permission propre au membre sur chaque salon de la ville, prioritaire sur les roles.
// - Vivant en ville : aucune restriction.
// - Vivant dehors, radio ou non : salons de la ville masques, sauf la mairie, lisible sans y ecrire (annonces). La
//   Tour Radio (a venir) rendra la ville accessible depuis dehors aux seuls porteurs de radio.
// - Mort ou zombifie : voit toujours sa ville (l'ame reste liee a sa partie) mais ne peut plus y interagir.
// - Exclu : plus aucun salon de la ville.
// Salon « ondes-radio » du groupe : ouvert aux porteurs de radio (vivants ou exclus), en ville comme dehors : un porteur
// en ville relaie les nouvelles des ondes a ses concitoyens.

const ECRITURE = ["SendMessages", "SendMessagesInThreads", "CreatePublicThreads", "AddReactions", "Connect", "Speak"] as const;
type Permission = "ViewChannel" | (typeof ECRITURE)[number];
type Acces = Partial<Record<Permission, boolean>>;

const LECTURE_SEULE: Acces = Object.fromEntries(ECRITURE.map((p) => [p, false]));
const MASQUE: Acces = { ViewChannel: false };
const LIBRE: Acces = {};

async function salonsDeVille(guild: Guild, villeId: number) {
  const ressources = await prisma.ressourceDiscord.findMany({
    where: { guildId: guild.id, type: TypeRessourceDiscord.SALON, cle: { startsWith: `salon:ville:${villeId}:` } },
  });
  const salons: { cle: string; salon: TextChannel | VoiceChannel }[] = [];
  for (const { cle, discordId } of ressources) {
    const salon = await guild.channels.fetch(discordId).catch(() => null);
    if (salon && (salon.type === ChannelType.GuildText || salon.type === ChannelType.GuildVoice)) salons.push({ cle, salon });
  }
  return salons;
}

// Pose la permission propre du membre sur le salon, en remplacant l'ancienne ; rien a faire si elle est deja en place
async function appliquerAcces(salon: TextChannel | VoiceChannel, membre: GuildMember, acces: Acces): Promise<void> {
  let allow = 0n;
  let deny = 0n;
  for (const [permission, valeur] of Object.entries(acces) as [Permission, boolean][]) {
    if (valeur) allow |= PermissionFlagsBits[permission];
    else deny |= PermissionFlagsBits[permission];
  }
  const actuel = salon.permissionOverwrites.cache.get(membre.id);
  if (allow === 0n && deny === 0n) {
    if (actuel) await salon.permissionOverwrites.delete(membre).catch(() => null);
    return;
  }
  if (actuel && actuel.allow.bitfield === allow && actuel.deny.bitfield === deny) return;
  await salon.permissionOverwrites.create(membre, acces).catch(() => null);
}

async function retirerRole(membre: GuildMember, cle: string) {
  const role = await trouverRole(membre.guild, cle);
  if (role) await membre.roles.remove(role).catch(() => null);
}

async function ajouterRole(membre: GuildMember, cle: string) {
  const role = await trouverRole(membre.guild, cle);
  if (role) await membre.roles.add(role).catch(() => null);
}

// Role Nomade = membre sans ville en jeu (conception.md §1). Une ville en cours de creation ne compte
// pas : le role n'est retire qu'a la fondation.
export async function aUneVilleEnJeu(discordId: string): Promise<boolean> {
  const joueur = await prisma.joueur.findFirst({
    where: { utilisateur: { discordId }, dateSortie: null, ville: { statut: StatutVille.ACTIVE } },
    select: { id: true },
  });
  return joueur !== null;
}

export async function synchroniserNomade(membre: GuildMember): Promise<void> {
  if (membre.user.bot) return;
  if (await aUneVilleEnJeu(membre.id)) await retirerRole(membre, ROLE_NOMADE.cle);
  else await ajouterRole(membre, ROLE_NOMADE.cle);
}

// Recalcule le role Radio et les acces du joueur aux salons de sa ville et au salon radio de son groupe.
// A appeler apres tout changement de position, de statut, ou quand une radio entre dans son sac ou en sort.
export async function synchroniserAccesJoueur(guild: Guild, joueurId: number): Promise<void> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { utilisateur: true, ville: true } });
  if (joueur.villeId === null || joueur.dateSortie !== null) return;
  const membre = await guild.members.fetch(joueur.utilisateur.discordId).catch(() => null);
  if (!membre) return;

  const enJeu = joueur.statut === StatutJoueur.VIVANT || joueur.statut === StatutJoueur.EXCLU;
  const dehors = joueur.zoneActuelleId !== null;
  const radio =
    enJeu &&
    (await prisma.inventaireJoueur.count({ where: { joueurId, quantite: { gt: 0 }, objet: { nom: OBJET_RADIO } } })) > 0;

  if (radio) await ajouterRole(membre, ROLE_RADIO.cle);
  else await retirerRole(membre, ROLE_RADIO.cle);

  for (const { cle, salon } of await salonsDeVille(guild, joueur.villeId)) {
    const mairie = cle === `salon:ville:${joueur.villeId}:mairie`;
    const acces =
      joueur.statut === StatutJoueur.EXCLU
        ? MASQUE
        : !enJeu
          ? LECTURE_SEULE
          : dehors
            ? mairie
              ? LECTURE_SEULE
              : MASQUE
            : LIBRE;
    await appliquerAcces(salon, membre, acces);
  }

  const groupeId = joueur.ville?.groupeId;
  if (groupeId == null) return;
  const salonRadio = radio ? await ensureSalonRadio(guild, groupeId) : await trouverSalonTexte(guild, `salon:groupe:${groupeId}:radio`);
  if (salonRadio) await appliquerAcces(salonRadio, membre, radio ? { ViewChannel: true, SendMessages: true } : LIBRE);
}

// Mort d'un joueur : role Mort a la place de Citoyen, plus de position en territoire externe, et
// ville en lecture seule (synchroniserAccesJoueur).
export async function appliquerMortDiscord(guild: Guild, joueurId: number, zoneAvantId: number | null): Promise<void> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { utilisateur: true } });
  const membre = await guild.members.fetch(joueur.utilisateur.discordId).catch(() => null);
  if (!membre) return;

  await ajouterRole(membre, ROLE_MORT.cle);
  await retirerRole(membre, ROLE_CITOYEN.cle);
  if (zoneAvantId !== null) await retirerRole(membre, `role:position:zone:${zoneAvantId}`);
  await synchroniserAccesJoueur(guild, joueurId);
}

// Depart de la ville (joueur mort qui la quitte, ou chute de la ville) : retrait des roles lies a la ville
// et des permissions propres posees sur ses salons et sur le salon radio, retour du role Nomade. Le role-ville
// retire lui enleve aussi la vue des salons.
export async function retirerJoueurDeVilleDiscord(guild: Guild, discordId: string, villeId: number): Promise<void> {
  const membre = await guild.members.fetch(discordId).catch(() => null);
  if (!membre) return;

  await retirerRole(membre, `role:ville:${villeId}`);
  await retirerRole(membre, ROLE_CITOYEN.cle);
  await retirerRole(membre, ROLE_MORT.cle);
  await retirerRole(membre, ROLE_RADIO.cle);
  await ajouterRole(membre, ROLE_NOMADE.cle);

  for (const { salon } of await salonsDeVille(guild, villeId)) await appliquerAcces(salon, membre, LIBRE);
  const ville = await prisma.ville.findUnique({ where: { id: villeId }, select: { groupeId: true } });
  const salonRadio = ville?.groupeId != null ? await trouverSalonTexte(guild, `salon:groupe:${ville.groupeId}:radio`) : null;
  if (salonRadio) await appliquerAcces(salonRadio, membre, LIBRE);
}

// Exclusion d'un joueur (conception.md §5) : il perd l'acces aux salons de sa ville mais garde son role-ville,
// qui lui laisse la vue des territoires externes ou il continue d'exister.
export async function appliquerExclusionDiscord(guild: Guild, joueurId: number): Promise<void> {
  await synchroniserAccesJoueur(guild, joueurId);
}

// Retour a la vie normale (resurrection, reintegration, reset de la ville) : role Citoyen a la place de Mort,
// puis acces recalcules selon sa position.
export async function retablirJoueurDiscord(guild: Guild, joueurId: number): Promise<void> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { utilisateur: true } });
  const membre = await guild.members.fetch(joueur.utilisateur.discordId).catch(() => null);
  if (!membre) return;
  await ajouterRole(membre, ROLE_CITOYEN.cle);
  await retirerRole(membre, ROLE_MORT.cle);
  await synchroniserAccesJoueur(guild, joueurId);
}

// Deplacement entre zones (null = en ville) : echange des roles Position, seul acces aux salons de zone
export async function changerPositionDiscord(
  guild: Guild,
  discordId: string,
  ancienneZoneId: number | null,
  nouvelleZoneId: number | null,
): Promise<void> {
  const membre = await guild.members.fetch(discordId).catch(() => null);
  if (!membre) return;
  if (ancienneZoneId !== null) await retirerRole(membre, `role:position:zone:${ancienneZoneId}`);
  if (nouvelleZoneId !== null) await ajouterRole(membre, `role:position:zone:${nouvelleZoneId}`);
}
