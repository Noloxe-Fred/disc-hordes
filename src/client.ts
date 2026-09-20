import type { ChatInputCommandInteraction, SlashCommandBuilder } from "discord.js";
import { Client, Collection, GatewayIntentBits } from "discord.js";

export interface Command {
  data: SlashCommandBuilder;
  execute: (interaction: ChatInputCommandInteraction) => Promise<void>;
}

export class DiscHordesClient extends Client {
  commands = new Collection<string, Command>();
}

export function createClient(): DiscHordesClient {
  return new DiscHordesClient({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });
}
