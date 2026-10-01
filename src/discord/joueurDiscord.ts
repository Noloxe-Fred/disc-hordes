import { StatutJoueur, StatutVille, TypeBatiment, TypeRessourceDiscord } from "@prisma/client";
import { ChannelType, PermissionFlagsBits, type Guild, type GuildMember, type TextChannel, type VoiceChannel } from "discord.js";
import { OBJET_RADIO } from "../config/objets";
import { prisma } from "../db";
import { trouverRole, trouverSalonTexte } from "./reconcile";
import { ROLE_CITOYEN, ROLE_MJ, ROLE_MORT, ROLE_NOMADE, ROLE_RADIO } from "./structure";
import { ensureSalonRadio } from "./territoires";

// Acces Discord d'un joueur a sa ville et aux ondes radio de son groupe (conception.md §1 et §3), recalcule en entier
// par synchroniserAccesJoueur a chaque changement de situation (deplacement, mort, exclusion, retour a la vie,
// radio gagnee ou perdue) : une permission propre au membre sur chaque salon de la ville, prioritaire sur les roles.
// - Vivant en ville : aucune restriction.
// - Vivant dehors : salons de la ville masques, sauf la mairie, lisible sans y ecrire (annonces). Une fois la Tour
//   Radio construite, les porteurs de radio gardent dehors le meme acces qu'en ville.
// - Mort ou zombifie : voit toujours sa ville (l'ame reste liee a sa partie) mais ne peut plus y interagir.
// - Exclu : plus aucun salon de la ville.
// - MJ actif : aucune restriction propre, son role lui ouvre tout le jeu (il ne peut pas jouer tant qu'il est actif).
// Salon « ondes-radio » du groupe : ouvert aux porteurs de radio (vivants ou exclus), en ville comme dehors : un porteur
// en ville relaie les nouvelles des ondes a ses concitoyens. La Tour Radio construite l'ouvre a tous les habitants
// vivants de la ville, avec ou sans radio.

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
  const tourRadio = await tourRadioConstruite(joueur.villeId);
  const ondes = radio || (tourRadio && joueur.statut === StatutJoueur.VIVANT);

  if (radio) await ajouterRole(membre, ROLE_RADIO.cle);
  else await retirerRole(membre, ROLE_RADIO.cle);
  const roleMj = await trouverRole(guild, ROLE_MJ.cle);
  const mjActif = roleMj !== null && membre.roles.cache.has(roleMj.id);

  for (const { cle, salon } of await salonsDeVille(guild, joueur.villeId)) {
    const mairie = cle === `salon:ville:${joueur.villeId}:mairie`;
    const acces = mjActif
      ? LIBRE
      : joueur.statut === StatutJoueur.EXCLU
        ? MASQUE
        : !enJeu
          ? LECTURE_SEULE
          : dehors && !(radio && tourRadio)
            ? mairie
              ? LECTURE_SEULE
              : MASQUE
            : LIBRE;
    await appliquerAcces(salon, membre, acces);
  }

  const groupeId = joueur.ville?.groupeId;
  if (groupeId == null) return;
  const salonRadio = ondes ? await ensureSalonRadio(guild, groupeId) : await trouverSalonTexte(guild, `salon:groupe:${groupeId}:radio`);
  if (salonRadio) await appliquerAcces(salonRadio, membre, ondes ? { ViewChannel: true, SendMessages: true } : LIBRE);
}

async function tourRadioConstruite(villeId: number): Promise<boolean> {
  const tour = await prisma.batimentVille.findUnique({ where: { villeId_type: { villeId, type: TypeBatiment.TOUR_RADIO } } });
  return (tour?.palierActuel ?? 0) >= 1;
}

// Tour Radio terminee : acces recalcules pour tous les habitants de la ville (ondes-radio, ville vue de dehors)
export async function synchroniserAccesVille(guild: Guild, villeId: number): Promise<void> {
  const habitants = await prisma.joueur.findMany({ where: { villeId, dateSortie: null }, select: { id: true } });
  for (const { id } of habitants) await synchroniserAccesJoueur(guild, id);
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
// retire lui enleve aussi la vue des salons. Membre parti du serveur : seules ses permissions propres sont effacees.
export async function retirerJoueurDeVilleDiscord(guild: Guild, discordId: string, villeId: number): Promise<void> {
  const membre = await guild.members.fetch(discordId).catch(() => null);
  if (!membre) {
    const ville = await prisma.ville.findUnique({ where: { id: villeId }, select: { groupeId: true } });
    const salonRadio = ville?.groupeId != null ? await trouverSalonTexte(guild, `salon:groupe:${ville.groupeId}:radio`) : null;
    const salons = [...(await salonsDeVille(guild, villeId)).map(({ salon }) => salon), ...(salonRadio ? [salonRadio] : [])];
    for (const salon of salons) {
      if (salon.permissionOverwrites.cache.has(discordId)) await salon.permissionOverwrites.delete(discordId).catch(() => null);
    }
    return;
  }

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

// Changement de ville d'un survivant accueilli par le maire d'une autre ville du groupe (discord/accueil.ts) :
// role-ville echange, permissions propres sur les salons de l'ancienne ville retirees, puis acces recalcules.
// La ville est deja changee en base.
export async function changerDeVilleDiscord(guild: Guild, joueurId: number, ancienneVilleId: number): Promise<void> {
  const joueur = await prisma.joueur.findUniqueOrThrow({ where: { id: joueurId }, include: { utilisateur: true } });
  const membre = await guild.members.fetch(joueur.utilisateur.discordId).catch(() => null);
  if (!membre) return;
  await retirerRole(membre, `role:ville:${ancienneVilleId}`);
  await ajouterRole(membre, `role:ville:${joueur.villeId}`);
  await ajouterRole(membre, ROLE_CITOYEN.cle);
  for (const { salon } of await salonsDeVille(guild, ancienneVilleId)) await appliquerAcces(salon, membre, LIBRE);
  await synchroniserAccesJoueur(guild, joueurId);
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
