import type { User } from "discord.js";
import { prisma } from "../db";

export async function trouverOuCreerUtilisateur(user: User) {
  return prisma.utilisateur.upsert({
    where: { discordId: user.id },
    update: { pseudoCache: user.username },
    create: { discordId: user.id, pseudoCache: user.username },
  });
}
