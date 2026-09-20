import { Client, Collection, GatewayIntentBits } from "discord.js";

export interface Command {
  data: { name: string };
  execute: (interaction: import("discord.js").ChatInputCommandInteraction) => Promise<void>;
}

export class DiscHordesClient extends Client {
  commands = new Collection<string, Command>();
}

export function createClient(): DiscHordesClient {
  return new DiscHordesClient({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });
}
