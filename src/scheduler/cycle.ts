import { MeteoType, StatutVille, TypeBatiment, TypePhase, type Ville } from "@prisma/client";
import { ChannelType } from "discord.js";
import type { DiscHordesClient } from "../client";
import { prisma } from "../db";
import { calculerDefenseTotale, calculerForceAttaque } from "../game/attaque";

// Horloge commune : toutes les villes actives basculent jour/nuit au meme minuit reel,
// plutot que 24h/48h apres leur propre fondation (conception.md §2). Le bot ne gerant qu'un
// seul serveur Discord en V1, on prend la premiere (et seule) guilde connue du client.

function msJusquauProchainMinuit(): number {
  const maintenant = new Date();
  const prochainMinuit = new Date(maintenant);
  prochainMinuit.setHours(24, 0, 0, 0);
  return prochainMinuit.getTime() - maintenant.getTime();
}

async function posterDansMairie(client: DiscHordesClient, guildId: string, villeId: number, message: string) {
  const ressource = await prisma.ressourceDiscord.findUnique({
    where: { guildId_cle: { guildId, cle: `salon:ville:${villeId}:mairie` } },
  });
  if (!ressource) return;

  const salon = await client.channels.fetch(ressource.discordId).catch(() => null);
  if (salon?.type === ChannelType.GuildText) await salon.send(message).catch(() => null);
}

async function basculerVersNuit(client: DiscHordesClient, guildId: string, ville: Ville) {
  const etaitEnGrace = !ville.premiereNuitPassee;

  await prisma.ville.update({
    where: { id: ville.id },
    data: { phaseActuelle: TypePhase.NUIT, phaseDepuis: new Date(), premiereNuitPassee: true },
  });

  if (etaitEnGrace) {
    await posterDansMairie(
      client,
      guildId,
      ville.id,
      `🌙 La nuit tombe sur **${ville.nom}**. Première nuit : calme, aucune attaque cette fois-ci.`,
    );
    return;
  }

  const palissade = await prisma.batimentVille.findUnique({
    where: { villeId_type: { villeId: ville.id, type: TypeBatiment.PALISSADE } },
  });

  const meteoMauvaise = ville.meteoActuelle === MeteoType.MAUVAIS_TEMPS;
  const forceAttaque = calculerForceAttaque(ville.cycleActuel, meteoMauvaise);
  // Aucun systeme de garde volontaire pour l'instant : bonus de garde toujours nul.
  const defenseTotale = calculerDefenseTotale(palissade?.palierActuel ?? 0, 0);

  await prisma.cycleAttaque.create({
    data: {
      villeId: ville.id,
      cycleNumero: ville.cycleActuel,
      forceAttaque,
      defenseTotale,
      meteoMauvais: meteoMauvaise,
    },
  });

  const deficit = Math.max(0, forceAttaque - defenseTotale);
  await posterDansMairie(
    client,
    guildId,
    ville.id,
    `🧟 Attaque de zombies sur **${ville.nom}** ! Force ${forceAttaque.toFixed(1)} contre une défense de ${defenseTotale}` +
      (deficit > 0
        ? ` — déficit de ${deficit.toFixed(1)} (résolution des dégâts/blessures pas encore implémentée).`
        : " — repoussée sans difficulté."),
  );
}

async function basculerVersJour(client: DiscHordesClient, guildId: string, ville: Ville) {
  const nouveauCycle = ville.cycleActuel + 1;

  await prisma.ville.update({
    where: { id: ville.id },
    data: { phaseActuelle: TypePhase.JOUR, phaseDepuis: new Date(), cycleActuel: nouveauCycle },
  });

  await posterDansMairie(client, guildId, ville.id, `☀️ Le jour se lève sur **${ville.nom}** (cycle ${nouveauCycle}).`);
}

async function executerTick(client: DiscHordesClient) {
  const guild = client.guilds.cache.first();
  if (!guild) return;

  const villes = await prisma.ville.findMany({ where: { statut: StatutVille.ACTIVE } });

  for (const ville of villes) {
    if (ville.phaseActuelle === TypePhase.JOUR) {
      await basculerVersNuit(client, guild.id, ville);
    } else {
      await basculerVersJour(client, guild.id, ville);
    }
  }
}

export function demarrerHorlogeCycle(client: DiscHordesClient): void {
  const planifierProchainTick = () => {
    setTimeout(async () => {
      try {
        await executerTick(client);
      } catch (error) {
        console.error("Erreur lors du tick de cycle jour/nuit", error);
      }
      planifierProchainTick();
    }, msJusquauProchainMinuit());
  };

  planifierProchainTick();
}
