import { StatutVille } from "@prisma/client";
import { PermissionFlagsBits, type Guild, type OverwriteResolvable, type Role } from "discord.js";
import { PALIERS_ZONE, TYPES_ZONE, nomSalonZone } from "../config/zones";
import { prisma } from "../db";
import { ensureAdjacencesGroupe, nomZone } from "../services/zones";
import { ensureCategory, ensureRole, ensureTextChannel, trouverRole, trouverSalonTexte } from "./reconcile";

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

  const overwritesCategorie: OverwriteResolvable[] = [
    { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
    ...rolesVille.map((role) => ({ id: role.id, allow: [PermissionFlagsBits.ViewChannel] })),
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
        continue;
      }
      await ensureTextChannel(guild, cle, nomSalonZone(type.nom, nomPalier), categorie.id, [
        { id: everyoneId, deny: [PermissionFlagsBits.ViewChannel] },
        { id: rolePosition.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] },
      ]);
    }
  }

  await ensureAdjacencesGroupe(groupeId);
}
