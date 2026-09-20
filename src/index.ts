import "dotenv/config";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { Events } from "discord.js";
import { createClient, type Command } from "./client";
import { prisma } from "./db";

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
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (error) {
    console.error(`Erreur lors de l'execution de /${interaction.commandName}`, error);
    const reply = { content: "Une erreur est survenue.", ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
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
