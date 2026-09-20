import "dotenv/config";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { Events } from "discord.js";
import { createClient, type Command } from "./client";
import { prisma } from "./db";
import { gererBouton } from "./discord/boutons";

const client = createClient();

const commandsDir = join(__dirname, "commands");
for (const file of readdirSync(commandsDir).filter((f) => f.endsWith(".ts") || f.endsWith(".js"))) {
  const command: Command = require(join(commandsDir, file)).default;
  client.commands.set(command.data.name, command);
}

client.once(Events.ClientReady, (readyClient) => {
  console.log(`Connecte en tant que ${readyClient.user.tag}`);
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
    const reply = { content: "Une erreur est survenue.", ephemeral: true };
    if (interaction.isRepliable() && (interaction.replied || interaction.deferred)) {
      await interaction.followUp(reply);
    } else if (interaction.isRepliable()) {
      await interaction.reply(reply);
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
