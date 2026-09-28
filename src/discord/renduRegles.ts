import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import satori from "satori";

// Rendu PNG d'une section des regles joueurs (docs/regles-joueurs.md), publiee en image dans #regles.
// satori met en page (retour a la ligne, gras, emojis) et produit un SVG, rasterise ensuite par resvg.
// Charte inspiree de MyHordes, comme la carte : cadre brun, bordure beige, titres crème en Courier Prime,
// corps en Nunito. Les emojis sont remplaces par leur image Twemoji (paquet @twemoji/svg, licence CC-BY 4.0).
//
// Markdown pris en charge (celui du fichier de regles) : "# " titre de section, "## " sous-titre, "> " encadre,
// une ligne = une ligne affichee, ligne vide = espacement ; en ligne : **gras**, *italique*, `code`, #salon.

const DOSSIER_POLICES = join(__dirname, "..", "..", "assets", "fonts");
const DOSSIER_EMOJIS = join(__dirname, "..", "..", "node_modules", "@twemoji", "svg");

const LARGEUR = 800;
const ECHELLE = 1.5; // image finale de 1200 px de large, nette une fois reduite par Discord

const COULEUR = {
  cadre: "#5c2b20",
  bandeau: "#3e2417",
  bord: "#ddab76",
  titre: "#f0d79e",
  sousTitre: "#ddab76",
  texte: "#f8eacb",
  gras: "#ffffff",
  encadre: "#4a261e",
  code: "#b4da4c",
  fondCode: "#2e3a0c",
  salon: "#b4da4c",
  filet: "#7e4d2a",
};

interface Noeud {
  type: string;
  props: { style?: Record<string, unknown>; children?: Noeud[] | string };
}

function el(type: string, style: Record<string, unknown>, children?: Noeud[] | string): Noeud {
  return { type, props: { style: { display: "flex", ...style }, children } };
}

// --- Polices et emojis ---

let polices: Parameters<typeof satori>[1]["fonts"] | null = null;
function chargerPolices() {
  const lire = (fichier: string) => readFileSync(join(DOSSIER_POLICES, fichier));
  polices ??= [
    { name: "Nunito", data: lire("nunito-latin-400-normal.woff"), weight: 400, style: "normal" },
    { name: "Nunito", data: lire("nunito-latin-400-italic.woff"), weight: 400, style: "italic" },
    { name: "Nunito", data: lire("nunito-latin-700-normal.woff"), weight: 700, style: "normal" },
    { name: "Nunito", data: lire("nunito-latin-800-normal.woff"), weight: 800, style: "normal" },
    { name: "Courier Prime", data: lire("CourierPrime-Regular.ttf"), weight: 400, style: "normal" },
    { name: "Courier Prime", data: lire("CourierPrime-Bold.ttf"), weight: 700, style: "normal" },
  ];
  return polices;
}

const IMAGE_VIDE = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"/>').toString("base64")}`;
const cacheEmojis = new Map<string, string>();

// Nom de fichier Twemoji : points de code en hexadecimal joints par "-", sans le selecteur de variante FE0F
// (sauf dans les sequences ZWJ, ou certains fichiers le conservent)
function imageEmoji(emoji: string): string {
  const enCache = cacheEmojis.get(emoji);
  if (enCache) return enCache;
  const codes = [...emoji].map((c) => c.codePointAt(0)!.toString(16));
  const candidats = [codes.filter((c) => c !== "fe0f").join("-"), codes.join("-")];
  const fichier = candidats.map((nom) => join(DOSSIER_EMOJIS, `${nom}.svg`)).find((chemin) => existsSync(chemin));
  const image = fichier ? `data:image/svg+xml;base64,${readFileSync(fichier).toString("base64")}` : IMAGE_VIDE;
  cacheEmojis.set(emoji, image);
  return image;
}

// --- Markdown -> elements satori ---

type Style = "normal" | "gras" | "italique" | "code";

// Decoupe une ligne en mots stylés. Chaque mot devient un element distinct dans une rangee flex qui passe a la
// ligne : satori ne fait pas couler du texte d'un element a l'autre, c'est donc le mot qui est l'unite de
// mise en page.
function motsStyles(ligne: string): { mot: string; style: Style; colle: boolean }[] {
  const mots: { mot: string; style: Style; colle: boolean }[] = [];
  let precedentFiniParEspace = true;
  for (const morceau of ligne.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/)) {
    if (!morceau) continue;
    // Deux morceaux accoles sans espace (ex. ponctuation juste apres du gras) : pas d'espace entre eux
    if (mots.length > 0 && !precedentFiniParEspace && !/^\s/.test(morceau)) mots[mots.length - 1].colle = true;
    precedentFiniParEspace = /\s$/.test(morceau);
    const [style, texte]: [Style, string] = morceau.startsWith("**")
      ? ["gras", morceau.slice(2, -2)]
      : morceau.startsWith("`")
        ? ["code", morceau.slice(1, -1)]
        : morceau.startsWith("*") && morceau.length > 2
          ? ["italique", morceau.slice(1, -1)]
          : ["normal", morceau];
    // Le code reste d'un bloc ; le reste est coupe aux espaces
    if (style === "code") mots.push({ mot: texte, style, colle: false });
    else for (const mot of texte.split(/\s+/).filter(Boolean)) mots.push({ mot, style, colle: false });
  }
  return mots;
}

function ligneTexte(ligne: string, styleLigne: Record<string, unknown> = {}): Noeud {
  const mots = motsStyles(ligne).map(({ mot, style, colle }) => {
    const base: Record<string, unknown> = { marginRight: colle ? 0 : 6 };
    if (style === "gras") Object.assign(base, { fontWeight: 800, color: COULEUR.gras });
    if (style === "italique") Object.assign(base, { fontStyle: "italic" });
    if (style === "code") {
      Object.assign(base, {
        fontFamily: "Courier Prime",
        fontWeight: 700,
        color: COULEUR.code,
        backgroundColor: COULEUR.fondCode,
        padding: "0 6px",
        borderRadius: 4,
      });
    }
    // Mention de salon : #nom-du-salon
    if (style !== "code" && /^#[\p{L}\d-]+/u.test(mot)) Object.assign(base, { color: COULEUR.salon, fontWeight: 700 });
    return el("span", base, mot);
  });
  return el("div", { flexWrap: "wrap", alignItems: "center", ...styleLigne }, mots);
}

function blocs(texte: string): Noeud[] {
  const noeuds: Noeud[] = [];
  for (const brute of texte.split(/\r?\n/)) {
    const ligne = brute.trim();
    if (!ligne) {
      noeuds.push(el("div", { height: 10 }));
    } else if (ligne.startsWith("## ")) {
      noeuds.push(
        el(
          "div",
          {
            marginTop: 14,
            marginBottom: 6,
            paddingBottom: 4,
            borderBottom: `2px solid ${COULEUR.filet}`,
            fontFamily: "Courier Prime",
            fontWeight: 700,
            fontSize: 25,
            color: COULEUR.sousTitre,
          },
          ligne.slice(3),
        ),
      );
    } else if (ligne.startsWith("> ")) {
      noeuds.push(
        ligneTexte(ligne.slice(2), {
          backgroundColor: COULEUR.encadre,
          borderLeft: `5px solid ${COULEUR.bord}`,
          padding: "10px 14px",
          margin: "6px 0",
        }),
      );
    } else {
      noeuds.push(ligneTexte(ligne, { marginBottom: 4 }));
    }
  }
  // Pas d'espacement superflu en fin de section
  while (noeuds.length > 0 && noeuds[noeuds.length - 1].props.children === undefined) noeuds.pop();
  return noeuds;
}

// Section = "# Titre" suivi de son contenu
export function construireArbreSection(section: string): Noeud {
  const [premiere, ...reste] = section.trim().split(/\r?\n/);
  const titre = premiere.replace(/^#\s+/, "");
  return el(
    "div",
    {
      width: LARGEUR,
      flexDirection: "column",
      backgroundColor: COULEUR.cadre,
      border: `3px solid ${COULEUR.bord}`,
      fontFamily: "Nunito",
      fontSize: 21,
      lineHeight: 1.45,
      color: COULEUR.texte,
    },
    [
      el(
        "div",
        {
          padding: "20px 30px",
          backgroundColor: COULEUR.bandeau,
          borderBottom: `3px solid ${COULEUR.bord}`,
          fontFamily: "Courier Prime",
          fontWeight: 700,
          fontSize: 32,
          color: COULEUR.titre,
          letterSpacing: 1,
        },
        titre,
      ),
      el("div", { flexDirection: "column", padding: "18px 30px 24px" }, blocs(reste.join("\n"))),
    ],
  );
}

export async function rendreSection(section: string): Promise<Buffer> {
  const svg = await satori(construireArbreSection(section) as unknown as Parameters<typeof satori>[0], {
    width: LARGEUR,
    fonts: chargerPolices(),
    loadAdditionalAsset: async (code, segment) => (code === "emoji" ? imageEmoji(segment) : []),
  });
  return new Resvg(svg, { fitTo: { mode: "width", value: LARGEUR * ECHELLE } }).render().asPng();
}
