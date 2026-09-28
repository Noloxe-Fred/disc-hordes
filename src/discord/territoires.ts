import { StatutVille } from "@prisma/client";
import { PermissionFlagsBits, type Guild, type OverwriteResolvable, type Role, type TextChannel } from "discord.js";
import { PALIERS_ZONE, TYPES_ZONE, nomSalonZone } from "../config/zones";
import { prisma } from "../db";
import { ensureAdjacencesGroupe, nomZone } from "../services/zones";
import { ensureCategory, ensureRole, ensureTextChannel, trouverCategorie, trouverRole, trouverSalonTexte } from "./reconcile";
import { ROLE_MJ } from "./structure";

// Categorie "Territoires externes" d'un groupe (conception.md §1) : visible uniquement des villes
// fondees du groupe (via leurs roles-ville). Les salons de zone sont masques a tous sauf au role
// Position de la zone, donne au joueur present dans la zone lors de ses deplacements.
// Idempotent : appele a chaque fondation, cree ce qui manque (zones, salons, roles, liens d'adjacence) et ajoute
// la nouvelle ville a la visibilite.
export async function ensureTerritoiresGroupe(guild: Guild, groupeId: number): Promise<void> {
  const everyoneId = guild.roles.everyone.id;

  const villes = await prisma.ville.findMany({ where: { groupeId, statut: StatutVille.ACTIVE }, select: { id: true } });
  const rolesVille: Role[] = [];
  for (const { id } of villes) {
    const role = await trouverRole(guild, `role:ville:${id}`);
    if (role) rolesVille.push(role);
  }

  // Le MJ actif voit toutes les zones et les ondes radio (structure.ts)
  const roleMj = await trouverRole(guild, ROLE_MJ.cle);
  const accesMj: OverwriteResolvable[] = roleMj ? [{ id: roleMj.id, allow: [PermissionFlagsBits.ViewChannel] }] : [];
  const overwritesCategorie: OverwriteResolvable[] = [
    { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
    ...rolesVille.map((role) => ({ id: role.id, allow: [PermissionFlagsBits.ViewChannel] })),
    ...accesMj,
  ];
  const categorie = await ensureCategory(
    guild,
    `categorie:groupe:${groupeId}:territoires`,
    "Territoires externes",
    overwritesCategorie,
  );

  for (const type of TYPES_ZONE) {
    for (const { palier, nom: nomPalier } of PALIERS_ZONE) {
      const nom = nomZone(type.nom, nomPalier);
      const zone = await prisma.zone.upsert({
        where: { groupeId_nom: { groupeId, nom } },
        update: {},
        create: { groupeId, nom, palier },
      });

      // Role Position propre a cette zone de ce groupe : seul acces au salon de zone, attribue au
      // joueur qui s'y deplace. Pas de role partage entre groupes, sinon un joueur d'un autre
      // groupe positionne sur le meme type de zone verrait ce salon.
      const rolePosition = await ensureRole(guild, `role:position:zone:${zone.id}`, `Position:${nom} · G${groupeId}`);
      const accesPosition = { ViewChannel: true, SendMessages: true };

      const cle = `salon:zone:${zone.id}`;
      const salonExistant = await trouverSalonTexte(guild, cle);
      if (salonExistant) {
        // Edition ciblee (sans remplacer les autres permissions du salon)
        await salonExistant.permissionOverwrites.edit(everyoneId, { ViewChannel: false });
        await salonExistant.permissionOverwrites.edit(rolePosition, accesPosition);
        if (roleMj) await salonExistant.permissionOverwrites.edit(roleMj, { ViewChannel: true });
        continue;
      }
      await ensureTextChannel(guild, cle, nomSalonZone(type.nom, nomPalier), categorie.id, [
        { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
        { id: rolePosition.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
        ...accesMj,
      ]);
    }
  }

  await ensureSalonRadio(guild, groupeId);
  await ensureAdjacencesGroupe(groupeId);
}

// Salon « ondes-radio » du groupe (conception.md §1) : masque a tous, ouvert membre par membre aux porteurs de radio
// (joueurDiscord.ts). Cree aussi a la demande pour un groupe fonde avant son ajout. Un salon
// existant garde ses permissions de membres : seule celle de @everyone est reposee.
export async function ensureSalonRadio(guild: Guild, groupeId: number): Promise<TextChannel | null> {
  const everyoneId = guild.roles.everyone.id;
  const cle = `salon:groupe:${groupeId}:radio`;
  const roleMj = await trouverRole(guild, ROLE_MJ.cle);
  const existant = await trouverSalonTexte(guild, cle);
  if (existant) {
    await existant.permissionOverwrites.edit(everyoneId, { ViewChannel: false });
    if (roleMj) await existant.permissionOverwrites.edit(roleMj, { ViewChannel: true });
    return existant;
  }
  const categorie = await trouverCategorie(guild, `categorie:groupe:${groupeId}:territoires`);
  if (!categorie) return null;
  return ensureTextChannel(guild, cle, "ondes-radio", categorie.id, [
    { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
    ...(roleMj ? [{ id: roleMj.id, allow: [PermissionFlagsBits.ViewChannel] }] : []),
  ]);
}
