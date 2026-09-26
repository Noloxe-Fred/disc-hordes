import { CauseMort, MeteoType, StatutJoueur, StatutVille, TypeBatiment, TypePhase, type Ville } from "@prisma/client";
import { ChannelType, type Guild } from "discord.js";
import type { DiscHordesClient } from "../client";
import { prisma } from "../db";
import { calculerDefenseTotale, calculerForceAttaque } from "../game/attaque";
import { chanceTouche, degatsNuit, ratioDeficit } from "../game/blessuresNuit";
import { appliquerPhaseFaimSoif } from "../game/faimSoif";
import { infligerDegats, tenterInfection } from "../game/sante";

// Horloge commune : toutes les villes actives basculent jour/nuit au meme minuit reel,
// plutot que 24h/48h apres leur propre fondation (conception.md §2). Le bot ne gerant qu'un
// seul serveur Discord en V1, on prend la premiere (et seule) guilde connue du client.

function msJusquauProchainMinuit(): number {
  const maintenant = new Date();
  const prochainMinuit = new Date(maintenant);
  prochainMinuit.setHours(24, 0, 0, 0);
  return prochainMinuit.getTime() - maintenant.getTime();
}

async function posterDansMairie(guild: Guild, villeId: number, message: string) {
  const ressource = await prisma.ressourceDiscord.findUnique({
    where: { guildId_cle: { guildId: guild.id, cle: `salon:ville:${villeId}:mairie` } },
  });
  if (!ressource) return;

  const salon = await guild.channels.fetch(ressource.discordId).catch(() => null);
  if (salon?.type === ChannelType.GuildText) await salon.send(message).catch(() => null);
}

function habitantsVivants(villeId: number) {
  return prisma.joueur.findMany({
    where: { villeId, statut: StatutJoueur.VIVANT, dateSortie: null },
    include: { utilisateur: true },
  });
}

// Faim/soif a chaque changement de phase ; les jauges critiques ou vides font perdre des PV.
// Renvoie true si la ville est tombee (dernier habitant mort de faim ou de soif).
async function appliquerFaimSoif(guild: Guild, villeId: number): Promise<boolean> {
  for (const joueur of await habitantsVivants(villeId)) {
    const effet = appliquerPhaseFaimSoif(joueur.faim, joueur.soif);
    await prisma.joueur.update({ where: { id: joueur.id }, data: { faim: effet.faim, soif: effet.soif } });
    if (effet.pvPerdus === 0) continue;

    const resultat = await infligerDegats(guild, joueur.id, effet.pvPerdus, effet.cause);
    if (resultat.mort) {
      await posterDansMairie(
        guild,
        villeId,
        `💀 <@${joueur.utilisateur.discordId}> est ${effet.cause === CauseMort.FAIM ? "mort de faim" : "mort de soif"}.`,
      );
    }
    if (resultat.villeTombee) return true;
  }
  return false;
}

async function basculerVersNuit(guild: Guild, ville: Ville) {
  await prisma.ville.update({
    where: { id: ville.id },
    data: { phaseActuelle: TypePhase.NUIT, phaseDepuis: new Date() },
  });

  await posterDansMairie(guild, ville.id, `🌙 La nuit tombe sur **${ville.nom}**.`);
  await appliquerFaimSoif(guild, ville.id);
}

// Jets de l'attaque sur les citoyens presents en ville (pas en territoire externe). Renvoie les lignes
// du compte rendu public et si la ville est tombee. L'infection eventuelle reste cachee.
async function resoudreBlessuresNuit(
  guild: Guild,
  ville: Ville,
  forceAttaque: number,
  defenseTotale: number,
): Promise<{ lignes: string[]; villeTombee: boolean }> {
  const ratio = ratioDeficit(forceAttaque, defenseTotale);
  const lignes: string[] = [];
  if (ratio <= 0) return { lignes, villeTombee: false };

  const presents = (await habitantsVivants(ville.id)).filter((j) => j.zoneActuelleId === null);
  for (const joueur of presents) {
    if (Math.random() >= chanceTouche(ratio, joueur.maisonPalier)) continue;

    const pvPerdus = degatsNuit(ratio);
    await tenterInfection(joueur.id);
    const resultat = await infligerDegats(guild, joueur.id, pvPerdus, CauseMort.ATTAQUE_NOCTURNE);
    lignes.push(
      resultat.mort
        ? `💀 <@${joueur.utilisateur.discordId}> a été tué par les zombies.`
        : `🩸 <@${joueur.utilisateur.discordId}> a été blessé (−${pvPerdus} PV).`,
    );
    if (resultat.villeTombee) return { lignes, villeTombee: true };
  }
  return { lignes, villeTombee: false };
}

// L'attaque de zombies se resout a l'aube, en cloture de la nuit qui s'acheve (pas a la
// tombee de la nuit) : le minuit qui cloture une journee n'a donc jamais d'attaque, a chaque
// cycle et pour toutes les villes (conception.md §2).
async function basculerVersJour(guild: Guild, ville: Ville) {
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

  const { lignes, villeTombee } = await resoudreBlessuresNuit(guild, ville, forceAttaque, defenseTotale);

  const deficit = Math.max(0, forceAttaque - defenseTotale);
  const compteRendu =
    `🧟 Attaque de la nuit sur **${ville.nom}** : force ${forceAttaque.toFixed(1)} contre une défense de ${defenseTotale}` +
    (deficit > 0
      ? ` — déficit de ${deficit.toFixed(1)}.` + (lignes.length > 0 ? `\n${lignes.join("\n")}` : "\nPersonne n'a été touché.")
      : " — repoussée sans difficulté.");

  if (villeTombee) {
    await posterDansMairie(guild, ville.id, `${compteRendu}\n\n**${ville.nom}** est tombée.`);
    return;
  }

  const nouveauCycle = ville.cycleActuel + 1;
  await prisma.ville.update({
    where: { id: ville.id },
    data: { phaseActuelle: TypePhase.JOUR, phaseDepuis: new Date(), cycleActuel: nouveauCycle },
  });

  await posterDansMairie(guild, ville.id, `${compteRendu}\n☀️ Le jour se lève sur **${ville.nom}** (cycle ${nouveauCycle}).`);
  await appliquerFaimSoif(guild, ville.id);
}

async function executerTick(guild: Guild) {
  const villes = await prisma.ville.findMany({ where: { statut: StatutVille.ACTIVE } });

  for (const ville of villes) {
    try {
      if (ville.phaseActuelle === TypePhase.JOUR) {
        await basculerVersNuit(guild, ville);
      } else {
        await basculerVersJour(guild, ville);
      }
    } catch (error) {
      console.error(`Erreur lors du changement de phase de la ville ${ville.id}`, error);
    }
  }
}

export function demarrerHorlogeCycle(client: DiscHordesClient): void {
  const planifierProchainTick = () => {
    setTimeout(async () => {
      const guild = client.guilds.cache.first();
      if (guild) await executerTick(guild);
      planifierProchainTick();
    }, msJusquauProchainMinuit());
  };

  planifierProchainTick();
}
