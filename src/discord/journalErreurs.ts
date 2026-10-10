import { AsyncLocalStorage } from "node:async_hooks";
import { format } from "node:util";
import { ChannelType, EmbedBuilder, Events, type Client, type Interaction, type TextChannel } from "discord.js";
import { trouverSalonTexte } from "./reconcile";
import { SALON_GESTION } from "./structure";

// Journal des erreurs du bot, poste dans #gestion (categorie Admin-MJ, Admins seulement). Tout console.error y est
// relaye, avec le joueur et l'action en cours quand l'erreur survient pendant le traitement d'une interaction (contexte
// porte par AsyncLocalStorage, y compris a travers la file des operations et les taches d'arriere-plan qu'elle lance).
// S'y ajoutent les signes d'un bot qui ne repond plus : interaction restee sans reponse (« L'application ne repond
// plus » cote joueur), boucle d'evenements figee, connexion a Discord perdue longtemps, erreurs non rattrapees.
// Les entrees sont regroupees (un envoi toutes les quelques secondes) et les repetitions comptees plutot que repostees.

export interface ContexteAction {
  action: string;
  joueur?: string;
  salon?: string;
}

const contexte = new AsyncLocalStorage<ContexteAction>();

// Execute fn avec ce contexte : toute erreur signalee pendant son deroulement (meme asynchrone) le portera
export function avecContexte<T>(ctx: ContexteAction, fn: () => T): T {
  return contexte.run(ctx, fn);
}

type Gravite = "erreur" | "alerte" | "info";
const COULEURS: Record<Gravite, number> = { erreur: 0xd64545, alerte: 0xe0a030, info: 0x3fa34d };

interface Entree {
  titre: string;
  texte: string;
  gravite: Gravite;
  ctx?: ContexteAction;
  date: Date;
  repetitions: number;
}

const DELAI_REGROUPEMENT_MS = 3_000;
const DELAI_RECONNEXION_MS = 15_000;
const ENTREES_MAX = 20;
const ENTREES_PAR_MESSAGE = 3; // limite Discord de 6000 caracteres par message, embeds compris
const TEXTE_MAX = 1_400;
// Discord affiche « L'application ne repond plus » faute de reponse sous 3 s ; marge pour la requete en vol
const DELAI_REPONSE_INTERACTION_MS = 4_000;
const BLOCAGE_BOUCLE_MS = 5_000;
// En deca, une coupure est une reconnexion de routine demandee par Discord : pas d'entree
const COUPURE_SIGNALEE_MS = 60_000;

const consoleErrorOriginal = console.error.bind(console);
let client: Client | null = null;
let enAttente: Entree[] = [];
let ignorees = 0;
let minuteur: NodeJS.Timeout | null = null;
let salonId: string | null = null;

export function signalerErreur(titre: string, texte: string, gravite: Gravite = "erreur"): void {
  const ctx = contexte.getStore();
  const premiereLigne = texte.split("\n", 1)[0];
  const doublon = enAttente.find(
    (e) => e.titre === titre && e.texte.split("\n", 1)[0] === premiereLigne && e.ctx?.action === ctx?.action,
  );
  if (doublon) doublon.repetitions++;
  else if (enAttente.length >= ENTREES_MAX) ignorees++;
  else enAttente.push({ titre, texte, gravite, ctx, date: new Date(), repetitions: 1 });
  planifierEnvoi(DELAI_REGROUPEMENT_MS);
}

function planifierEnvoi(delai: number): void {
  if (minuteur) return;
  minuteur = setTimeout(() => {
    minuteur = null;
    void envoyer();
  }, delai);
  minuteur.unref();
}

async function salonGestion(): Promise<TextChannel | null> {
  const guild = client?.guilds.cache.first();
  if (!guild) return null;
  const connu = salonId ? guild.channels.cache.get(salonId) : null;
  if (connu?.type === ChannelType.GuildText) return connu;
  // Recherche par nom en secours : la base peut etre la cause de l'erreur a signaler
  const salon =
    (await trouverSalonTexte(guild, SALON_GESTION.cle).catch(() => null)) ??
    guild.channels.cache.find((c): c is TextChannel => c.type === ChannelType.GuildText && c.name === SALON_GESTION.nom) ??
    null;
  salonId = salon?.id ?? null;
  return salon;
}

function bloc(texte: string): string {
  const nettoye = texte.replaceAll("```", "ʼʼʼ");
  const tronque = nettoye.length > TEXTE_MAX ? `${nettoye.slice(0, TEXTE_MAX)}\n…` : nettoye;
  return `\`\`\`\n${tronque}\n\`\`\``;
}

function versEmbed(entree: Entree): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(COULEURS[entree.gravite])
    .setTitle(entree.repetitions > 1 ? `${entree.titre} (×${entree.repetitions})` : entree.titre)
    .setDescription(entree.texte ? bloc(entree.texte) : null)
    .setTimestamp(entree.date);
  if (entree.ctx) {
    embed.addFields({ name: "Action", value: entree.ctx.action.slice(0, 1_000) });
    if (entree.ctx.joueur) embed.addFields({ name: "Joueur", value: entree.ctx.joueur, inline: true });
    if (entree.ctx.salon) embed.addFields({ name: "Salon", value: entree.ctx.salon, inline: true });
  }
  return embed;
}

async function envoyer(): Promise<void> {
  if (enAttente.length === 0) return;
  // Hors ligne : on garde les entrees jusqu'au retour de la connexion
  if (!client?.isReady()) return planifierEnvoi(DELAI_RECONNEXION_MS);
  const lot = enAttente;
  const perdues = ignorees;
  enAttente = [];
  ignorees = 0;
  // Un echec d'envoi n'est jamais relaye ici (il bouclerait) : console seulement
  const salon = await salonGestion().catch(() => null);
  if (!salon) {
    consoleErrorOriginal(`Salon #${SALON_GESTION.nom} introuvable : ${lot.length} entrée(s) du journal des erreurs non postée(s)`);
    return;
  }
  for (let i = 0; i < lot.length; i += ENTREES_PAR_MESSAGE) {
    const embeds = lot.slice(i, i + ENTREES_PAR_MESSAGE).map(versEmbed);
    const dernier = i + ENTREES_PAR_MESSAGE >= lot.length;
    const content = dernier && perdues > 0 ? `… et ${perdues} autre(s) erreur(s) non affichée(s), voir la console.` : undefined;
    await salon
      .send({ content, embeds, allowedMentions: { parse: [] } })
      .catch((error) => consoleErrorOriginal("Envoi du journal des erreurs dans #gestion impossible", error));
  }
}

// --- Description de l'interaction en cours ---

export function decrireInteraction(interaction: Interaction): ContexteAction {
  const membre = interaction.member;
  const nom = membre && "displayName" in membre ? membre.displayName : interaction.user.displayName;
  const joueur = `${nom} (<@${interaction.user.id}>)`;
  const salon = interaction.channelId ? `<#${interaction.channelId}>` : undefined;
  let action: string;
  if (interaction.isChatInputCommand()) action = `Commande /${interaction.commandName}`;
  else if (interaction.isButton()) {
    const bouton = interaction.component;
    const libelle = ("label" in bouton && bouton.label) || ("emoji" in bouton && bouton.emoji?.name) || "sans libellé";
    action = `Bouton « ${libelle} » — \`${interaction.customId}\``;
  } else if (interaction.isAnySelectMenu()) {
    action = `Menu \`${interaction.customId}\` — choix : ${interaction.values.join(", ") || "aucun"}`;
  } else if (interaction.isModalSubmit()) action = `Formulaire \`${interaction.customId}\``;
  else if (interaction.isAutocomplete()) action = `Autocomplétion /${interaction.commandName}`;
  else action = `Interaction de type ${interaction.type}`;
  return { action, joueur, salon };
}

// Interaction restee sans reponse : le joueur a vu « L'application ne repond plus » (traitement trop lent, erreur
// avant l'accuse de reception, bouton d'un formulaire ou d'une confirmation expire...)
export function surveillerReponse(interaction: Interaction): void {
  if (!interaction.isRepliable()) return;
  const ctx = decrireInteraction(interaction);
  setTimeout(() => {
    if (interaction.replied || interaction.deferred) return;
    avecContexte(ctx, () =>
      signalerErreur(
        "⏱️ Interaction sans réponse",
        `Aucune réponse du bot dans les 3 s : Discord a affiché « L'application ne répond plus » au joueur.`,
        "alerte",
      ),
    );
  }, DELAI_REPONSE_INTERACTION_MS).unref();
}

function heure(date: Date): string {
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// A appeler une fois, au demarrage, avant la connexion du client
export function installerJournalErreurs(c: Client): void {
  client = c;

  console.error = (...args: unknown[]) => {
    consoleErrorOriginal(...args);
    try {
      signalerErreur("⚠️ Erreur", format(...args));
    } catch {
      // le journal ne doit jamais faire echouer l'appelant
    }
  };

  // Sans ces gestionnaires, Node arrete le processus : la rejection est seulement journalisee, le bot continue
  process.on("unhandledRejection", (raison) => {
    consoleErrorOriginal("Promesse rejetée non gérée", raison);
    signalerErreur("💥 Promesse rejetée non gérée", format(raison));
  });
  // Etat du processus incertain apres une exception non rattrapee : journal envoye puis arret (redemarrage a faire)
  process.on("uncaughtException", (error) => {
    consoleErrorOriginal("Exception non rattrapée", error);
    signalerErreur("💥 Exception non rattrapée — arrêt du bot", format(error));
    if (minuteur) clearTimeout(minuteur);
    minuteur = null;
    const arret = setTimeout(() => process.exit(1), 5_000);
    void envoyer().finally(() => {
      clearTimeout(arret);
      process.exit(1);
    });
  });

  c.on(Events.Error, (error) => signalerErreur("⚠️ Erreur du client Discord", format(error)));
  c.on(Events.ShardError, (error) => signalerErreur("🔌 Erreur de connexion à Discord", format(error), "alerte"));
  c.on(Events.Invalidated, () => signalerErreur("🔌 Session Discord invalidée", "Le bot doit être redémarré.", "erreur"));

  // Coupure de la connexion : signalee au retour, si elle a dure (le salon est injoignable entre-temps)
  let coupureDepuis: Date | null = null;
  c.on(Events.ShardDisconnect, (event) => {
    coupureDepuis ??= new Date();
    consoleErrorOriginal(`Connexion à Discord perdue (code ${event.code})`);
  });
  c.on(Events.ShardReconnecting, () => {
    coupureDepuis ??= new Date();
  });
  c.on(Events.ShardResume, () => {
    if (!coupureDepuis) return;
    const duree = Date.now() - coupureDepuis.getTime();
    if (duree >= COUPURE_SIGNALEE_MS) {
      signalerErreur(
        "🔌 Bot hors ligne",
        `Connexion à Discord perdue de ${heure(coupureDepuis)} à ${heure(new Date())} (${Math.round(duree / 1000)} s) : ` +
          "les actions des joueurs pendant la coupure n'ont pas été reçues.",
        "alerte",
      );
    }
    coupureDepuis = null;
  });

  c.once(Events.ClientReady, () => signalerErreur("✅ Bot démarré", "", "info"));

  // Boucle d'evenements figee (calcul trop long, rendu bloquant...) : le bot ne traite plus rien pendant ce temps
  let precedent = Date.now();
  setInterval(() => {
    const maintenant = Date.now();
    const retard = maintenant - precedent - 1_000;
    precedent = maintenant;
    if (retard >= BLOCAGE_BOUCLE_MS) {
      signalerErreur(
        "🧊 Bot figé",
        `Le bot n'a rien pu traiter pendant ${(retard / 1000).toFixed(1)} s (jusqu'à ${heure(new Date(maintenant))}).`,
        "alerte",
      );
    }
  }, 1_000).unref();
}
