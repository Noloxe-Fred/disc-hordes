import "dotenv/config";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { Events } from "discord.js";
import { createClient, type Command } from "./client";
import { prisma } from "./db";
import { gererBouton } from "./discord/boutons";
import { synchroniserNomade } from "./discord/joueurDiscord";
import { ensureAdjacencesGroupe } from "./services/zones";
import { demarrerHorlogeCycle } from "./scheduler/cycle";
import { rafraichirTousLesPanneaux } from "./discord/chantiers";

const client = createClient();

const commandsDir = join(__dirname, "commands");
for (const file of readdirSync(commandsDir).filter((f) => f.endsWith(".ts") || f.endsWith(".js"))) {
  const command: Command = require(join(commandsDir, file)).default;
  client.commands.set(command.data.name, command);
}

client.once(Events.ClientReady, async (readyClient) => {
  console.log(`Connecte en tant que ${readyClient.user.tag}`);

  // Deploiement des commandes a chaque demarrage : sur la guilde de dev si DISCORD_GUILD_ID est defini, sinon global
  const guildId = process.env.DISCORD_GUILD_ID || undefined;
  try {
    const body = client.commands.map((command) => command.data.toJSON());
    if (guildId) await readyClient.application.commands.set(body, guildId);
    else await readyClient.application.commands.set(body);
    console.log(`${body.length} commande(s) déployée(s)${guildId ? ` sur la guilde ${guildId}` : " globalement"}.`);
  } catch (error) {
    console.error("Echec du deploiement des commandes", error);
  }

  // Liens d'adjacence des groupes crees avant leur mise en place (idempotent)
  for (const { id } of await prisma.groupe.findMany({ select: { id: true } })) {
    await ensureAdjacencesGroupe(id).catch((error) => console.error(`Adjacences du groupe ${id} impossibles`, error));
  }

  // Panneau des chantiers de chaque ville en jeu (villes fondees avant sa mise en place, message supprime...)
  const guild = readyClient.guilds.cache.first();
  if (guild) await rafraichirTousLesPanneaux(guild);

  demarrerHorlogeCycle(client);
});

// Nouvel arrivant sur le serveur : role Nomade (pas encore de ville)
client.on(Events.GuildMemberAdd, async (membre) => {
  await synchroniserNomade(membre).catch((error) => console.error("Attribution du role Nomade impossible", error));
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      await command.execute(interaction);
    } else if (interaction.isButton()) {
      await gererBouton(interaction);
    }
  } catch (error) {
    console.error("Erreur lors du traitement d'une interaction", error);
    // Le message d'erreur peut lui-meme echouer (salon supprime entre-temps...) : ne jamais faire tomber le bot
    const reply = { content: "Une erreur est survenue.", ephemeral: true };
    if (interaction.isRepliable() && (interaction.replied || interaction.deferred)) {
      await interaction.followUp(reply).catch(() => null);
    } else if (interaction.isRepliable()) {
      await interaction.reply(reply).catch(() => null);
    }
  }
});

async function shutdown() {
  await prisma.$disconnect();
  client.destroy();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

client.login(process.env.DISCORD_TOKEN);
