import { CauseMort, MeteoType, StatutJoueur, StatutVille, TypeBatiment, TypePhase, type Ville } from "@prisma/client";
import type { Guild } from "discord.js";
import type { DiscHordesClient } from "../client";
import { prisma } from "../db";
import { AVANCE_ALERTE_ATTAQUE_MINUTES } from "../config/defense";
import { calculerDefenseTotale, calculerForceAttaque } from "../game/attaque";
import { chanceTouche, degatsNuit, ratioDeficit } from "../game/blessuresNuit";
import { appliquerPhaseFaimSoif, type Jauge, type NiveauJauge } from "../game/faimSoif";
import { calculerPaMax } from "../game/pa";
import { infligerDegats, tenterInfection } from "../game/sante";
import { blesserRencontresEnSuspens } from "../discord/combat";
import { posterDansMairie } from "../discord/villeStructure";
import { produireEauPuits } from "../services/puits";

// Horloge commune : toutes les villes actives basculent jour/nuit au meme minuit reel,
// plutot que 24h/48h apres leur propre fondation (conception.md §2). Le bot ne gerant qu'un
// seul serveur Discord en V1, on prend la premiere (et seule) guilde connue du client.

// Prochaine bascule jour/nuit, commune a toutes les villes (y compris apres une phase forcee par un admin)
export function prochaineBascule(maintenant: Date = new Date()): Date {
  const prochainMinuit = new Date(maintenant);
  prochainMinuit.setHours(24, 0, 0, 0);
  return prochainMinuit;
}

// Marge contre un minuteur declenche quelques ms en avance : sans elle, le "prochain minuit" recalcule juste
// apres une bascule serait encore le meme, et la bascule s'executerait deux fois
const MARGE_REPLANIFICATION_MS = 60_000;

function msJusquauProchainMinuit(): number {
  return prochaineBascule(new Date(Date.now() + MARGE_REPLANIFICATION_MS)).getTime() - Date.now();
}

function habitantsVivants(villeId: number) {
  return prisma.joueur.findMany({
    where: { villeId, statut: StatutJoueur.VIVANT, dateSortie: null },
    include: { utilisateur: true },
  });
}

const TEXTE_ALERTE: Record<Jauge, Record<Exclude<NiveauJauge, "normal">, string>> = {
  faim: {
    alerte: "commence à avoir faim",
    critique: "est affamé : PA max très réduits, et il perd des PV à chaque phase",
    vide: "meurt de faim : PA max encore réduits à chaque phase, et il perd des PV",
  },
  soif: {
    alerte: "commence à avoir soif",
    critique: "est assoiffé : PA max très réduits, et il perd des PV à chaque phase",
    vide: "meurt de soif : PA max encore réduits à chaque phase, et il perd des PV",
  },
};

// Faim/soif a chaque changement de phase ; les jauges critiques ou vides font perdre des PV, et le passage a un
// palier plus grave est annonce dans la mairie. Renvoie true si la ville est tombee (dernier habitant mort de
// faim ou de soif).
async function appliquerFaimSoif(guild: Guild, villeId: number): Promise<boolean> {
  const alertes: string[] = [];
  for (const joueur of await habitantsVivants(villeId)) {
    const effet = appliquerPhaseFaimSoif(joueur);
    await prisma.joueur.update({
      where: { id: joueur.id },
      data: { faim: effet.faim, soif: effet.soif, phasesFaimVide: effet.phasesFaimVide, phasesSoifVide: effet.phasesSoifVide },
    });

    const resultat = effet.pvPerdus > 0 ? await infligerDegats(guild, joueur.id, effet.pvPerdus, effet.cause) : null;
    if (resultat?.mort) {
      await posterDansMairie(
        guild,
        villeId,
        `💀 <@${joueur.utilisateur.discordId}> est ${effet.cause === CauseMort.FAIM ? "mort de faim" : "mort de soif"}.`,
      );
      if (resultat.villeTombee) return true;
      continue;
    }

    for (const { jauge, niveau, valeur } of effet.alertes) {
      if (niveau === "normal") continue;
      const icone = jauge === "faim" ? "🍖" : "💧";
      alertes.push(`${icone} <@${joueur.utilisateur.discordId}> ${TEXTE_ALERTE[jauge][niveau]} (${jauge} ${valeur}/100).`);
    }
  }

  if (alertes.length > 0) await posterDansMairie(guild, villeId, alertes.join("\n"));
  return false;
}

// Regeneration complete des PA a chaque changement de phase pour les habitants vivants qui ont dormi en ville
// (equilibrage.md §1) : retour au PA max effectif, calcule apres la faim/soif et les blessures de la phase, plus
// le bonus de reveil en attente (ragout fortifiant), qui est alors consomme. En territoire externe, pas de
// regeneration (la sieste partielle viendra avec les deplacements) : le bonus attend le retour en ville.
async function regenererPa(villeId: number) {
  for (const joueur of await habitantsVivants(villeId)) {
    if (joueur.zoneActuelleId !== null || joueur.paMax === null) continue;
    await prisma.joueur.update({
      where: { id: joueur.id },
      data: { paActuel: calculerPaMax(joueur).paMax + joueur.bonusPaReveil, bonusPaReveil: 0 },
    });
  }
}

// Effets de chaque changement de phase sur les habitants : faim/soif, rencontres de zombie laissees en suspens
// (-1 PV), puis regeneration des PA
async function appliquerEffetsPhase(guild: Guild, villeId: number) {
  if (await appliquerFaimSoif(guild, villeId)) return;
  const { morts, villeTombee } = await blesserRencontresEnSuspens(guild, villeId);
  if (morts.length > 0 && !villeTombee) await posterDansMairie(guild, villeId, morts.join("\n"));
  if (villeTombee) return;
  await regenererPa(villeId);
}

async function basculerVersNuit(guild: Guild, ville: Ville) {
  await prisma.ville.update({
    where: { id: ville.id },
    data: { phaseActuelle: TypePhase.NUIT, phaseDepuis: new Date() },
  });

  const aube = Math.floor(prochaineBascule().getTime() / 1000);
  await posterDansMairie(
    guild,
    ville.id,
    `🌙 La nuit tombe sur **${ville.nom}**. Les zombies attaqueront à l'aube, <t:${aube}:R>.`,
    { mentionnerVille: true },
  );
  await appliquerEffetsPhase(guild, ville.id);
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

// Resout une attaque de zombies sur la ville a la force de son cycle courant : jets de blessures et compte
// rendu public. "enregistrer" conserve l'attaque dans l'historique de la ville (attaque de l'aube) ; il est
// fait avant les blessures, pour que le recapitulatif d'une chute eventuelle en tienne compte.
export async function resoudreAttaque(
  guild: Guild,
  ville: Ville,
  enregistrer: boolean,
): Promise<{ compteRendu: string; villeTombee: boolean }> {
  const palissade = await prisma.batimentVille.findUnique({
    where: { villeId_type: { villeId: ville.id, type: TypeBatiment.PALISSADE } },
  });

  const meteoMauvaise = ville.meteoActuelle === MeteoType.MAUVAIS_TEMPS;
  const forceAttaque = calculerForceAttaque(ville.cycleActuel, meteoMauvaise);
  // Aucun systeme de garde volontaire pour l'instant : bonus de garde toujours nul.
  const defenseTotale = calculerDefenseTotale(palissade?.palierActuel ?? 0, 0);

  if (enregistrer) {
    // Upsert : un admin a pu reculer le cycle sur un numero deja joue
    const donnees = { forceAttaque, defenseTotale, meteoMauvais: meteoMauvaise, dateResolution: new Date() };
    await prisma.cycleAttaque.upsert({
      where: { villeId_cycleNumero: { villeId: ville.id, cycleNumero: ville.cycleActuel } },
      update: donnees,
      create: { villeId: ville.id, cycleNumero: ville.cycleActuel, ...donnees },
    });
  }

  const { lignes, villeTombee } = await resoudreBlessuresNuit(guild, ville, forceAttaque, defenseTotale);

  const deficit = Math.max(0, forceAttaque - defenseTotale);
  const compteRendu =
    `🧟 Attaque de zombies sur **${ville.nom}** : force ${forceAttaque.toFixed(1)} contre une défense de ${defenseTotale}` +
    (deficit > 0
      ? ` — déficit de ${deficit.toFixed(1)}.` + (lignes.length > 0 ? `\n${lignes.join("\n")}` : "\nPersonne n'a été touché.")
      : " — repoussée sans difficulté.");

  return { compteRendu, villeTombee };
}

// L'attaque de zombies se resout a l'aube, en cloture de la nuit qui s'acheve (pas a la
// tombee de la nuit) : le minuit qui cloture une journee n'a donc jamais d'attaque, a chaque
// cycle et pour toutes les villes (conception.md §2). Puis le puits verse sa production du nouveau cycle dans la banque.
async function basculerVersJour(guild: Guild, ville: Ville) {
  const { compteRendu, villeTombee } = await resoudreAttaque(guild, ville, true);

  if (villeTombee) {
    await posterDansMairie(guild, ville.id, `${compteRendu}\n\n**${ville.nom}** est tombée.`, { mentionnerVille: true });
    return;
  }

  const nouveauCycle = ville.cycleActuel + 1;
  await prisma.ville.update({
    where: { id: ville.id },
    data: { phaseActuelle: TypePhase.JOUR, phaseDepuis: new Date(), cycleActuel: nouveauCycle },
  });

  const puits = await produireEauPuits(ville.id);
  await posterDansMairie(
    guild,
    ville.id,
    `${compteRendu}\n☀️ Le jour se lève sur **${ville.nom}** (cycle ${nouveauCycle}).` + (puits ? `\n${puits}` : ""),
    { mentionnerVille: true },
  );
  await appliquerEffetsPhase(guild, ville.id);
}

// Changement de phase d'une ville : a minuit (horloge commune) ou force depuis le panneau /admin
export async function basculerPhase(guild: Guild, ville: Ville): Promise<void> {
  if (ville.phaseActuelle === TypePhase.JOUR) await basculerVersNuit(guild, ville);
  else await basculerVersJour(guild, ville);
}

async function executerTick(guild: Guild) {
  const villes = await prisma.ville.findMany({ where: { statut: StatutVille.ACTIVE } });

  for (const ville of villes) {
    try {
      await basculerPhase(guild, ville);
    } catch (error) {
      console.error(`Erreur lors du changement de phase de la ville ${ville.id}`, error);
    }
  }
}

// Alerte d'attaque : chaque ville en nuit est prevenue un peu avant l'aube
async function alerterAttaque(guild: Guild) {
  const villes = await prisma.ville.findMany({ where: { statut: StatutVille.ACTIVE, phaseActuelle: TypePhase.NUIT } });
  const aube = Math.floor(prochaineBascule().getTime() / 1000);
  for (const ville of villes) {
    await posterDansMairie(
      guild,
      ville.id,
      `⚠️ Les zombies approchent de **${ville.nom}** : l'attaque frappera <t:${aube}:R>. Rentrez en ville et tenez les murs !`,
      { mentionnerVille: true },
    );
  }
}

// Delai jusqu'a la prochaine alerte d'attaque (minuit moins l'avance) ; si elle est deja passee pour ce
// minuit (bot demarre dans l'heure precedente), elle vise le minuit suivant.
function msJusquaProchaineAlerte(): number {
  const avanceMs = AVANCE_ALERTE_ATTAQUE_MINUTES * 60_000;
  let alerte = prochaineBascule().getTime() - avanceMs;
  if (alerte <= Date.now() + MARGE_REPLANIFICATION_MS) alerte += 24 * 3_600_000;
  return alerte - Date.now();
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

  const planifierProchaineAlerte = () => {
    setTimeout(async () => {
      const guild = client.guilds.cache.first();
      if (guild) await alerterAttaque(guild).catch((error) => console.error("Alerte d'attaque impossible", error));
      planifierProchaineAlerte();
    }, msJusquaProchaineAlerte());
  };

  planifierProchaineAlerte();
}
