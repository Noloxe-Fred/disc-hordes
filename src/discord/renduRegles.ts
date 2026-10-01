import { Resvg } from "@resvg/resvg-js";
import satori from "satori";
import { COULEURS, ECHELLE, EPAISSEUR_CADRE, POLICE_TEXTE, POLICE_TITRE, TITRE_SECTION, policesPourSatori } from "./charteImages";
import { imageEmoji } from "./emojis";

// Rendu PNG d'une section de texte : regles joueurs (docs/regles-joueurs.md, publiees dans #regles) et message de
// bienvenue (docs/bienvenue.md). satori met en page (retour a la ligne, gras, emojis) et produit un SVG, rasterise
// ensuite par resvg. Couleurs, polices et cadre : charte commune des images (charteImages.ts). Les emojis sont
// remplaces par leur image Twemoji (paquet @twemoji/svg, licence CC-BY 4.0).
//
// Markdown pris en charge (celui du fichier de regles) : "# " titre de section, "## " sous-titre, "> " encadre,
// une ligne = une ligne affichee, ligne vide = espacement ; en ligne : **gras**, *italique*, `code`, #salon.

const LARGEUR = 800;

// Role de chaque couleur de la charte dans les sections de texte
const COULEUR = {
  cadre: COULEURS.cadre,
  bandeau: COULEURS.bandeau,
  bord: COULEURS.bord,
  titre: COULEURS.titre,
  sousTitre: COULEURS.sousTitre,
  texte: COULEURS.texte,
  gras: COULEURS.gras,
  encadre: COULEURS.encadre,
  code: COULEURS.vert,
  fondCode: COULEURS.vertFonce,
  salon: COULEURS.vert,
  filet: COULEURS.filet,
};

interface Noeud {
  type: string;
  props: { style?: Record<string, unknown>; children?: Noeud[] | string };
}

function el(type: string, style: Record<string, unknown>, children?: Noeud[] | string): Noeud {
  return { type, props: { style: { display: "flex", ...style }, children } };
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
        fontFamily: POLICE_TITRE,
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
            fontFamily: POLICE_TITRE,
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
      border: `${EPAISSEUR_CADRE}px solid ${COULEUR.bord}`,
      fontFamily: POLICE_TEXTE,
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
          borderBottom: `${EPAISSEUR_CADRE}px solid ${COULEUR.bord}`,
          fontFamily: POLICE_TITRE,
          fontWeight: 700,
          fontSize: TITRE_SECTION.taille,
          color: COULEUR.titre,
          letterSpacing: TITRE_SECTION.espacement,
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
    fonts: policesPourSatori(),
    loadAdditionalAsset: async (code, segment) => (code === "emoji" ? imageEmoji(segment) : []),
  });
  return new Resvg(svg, { fitTo: { mode: "width", value: LARGEUR * ECHELLE } }).render().asPng();
}
