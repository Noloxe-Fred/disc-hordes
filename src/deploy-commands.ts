import "dotenv/config";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import { REST, Routes } from "discord.js";
import type { Command } from "./client";

const commandsDir = join(__dirname, "commands");
const commands = readdirSync(commandsDir)
  .filter((f) => f.endsWith(".ts") || f.endsWith(".js"))
  .map((f) => (require(join(commandsDir, f)).default as Command).data.toJSON());

async function main() {
  const token = process.env.DISCORD_TOKEN;
  const clientId = process.env.DISCORD_CLIENT_ID;
  const guildId = process.env.DISCORD_GUILD_ID;

  if (!token || !clientId) {
    throw new Error("DISCORD_TOKEN et DISCORD_CLIENT_ID sont requis dans .env");
  }

  const rest = new REST().setToken(token);
  const route = guildId ? Routes.applicationGuildCommands(clientId, guildId) : Routes.applicationCommands(clientId);

  await rest.put(route, { body: commands });
  console.log(`${commands.length} commande(s) déployée(s)${guildId ? ` sur la guilde ${guildId}` : " globalement"}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
