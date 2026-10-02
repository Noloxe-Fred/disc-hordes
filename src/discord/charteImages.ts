import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";

// Charte graphique commune a toutes les images generees par le bot (carte, sac, regles, bienvenue, annonces de phase), inspiree de
// MyHordes : cadre brun a bordure beige, titres creme en Courier Prime, texte courant en Nunito, accents vert olive.
// Toute modification visuelle partagee (couleur, police, epaisseur, nettete) se fait ici ; les fichiers rendu*.ts
// ne gardent que leur mise en page (dimensions, positions).

// --- Couleurs ---

export const COULEURS = {
  // Cadre et titres, communs a toutes les images
  cadre: "#5c2b20", // fond brun
  bandeau: "#3e2417", // fond du bandeau de titre, des cases et des jauges
  bord: "#ddab76", // bordure beige du cadre et des cases pleines, sous-titres
  titre: "#f0d79e", // titre creme
  sousTitre: "#ddab76",
  texte: "#f8eacb",
  gras: "#ffffff",
  filet: "#7e4d2a", // traits de separation, bordures discretes
  encadre: "#4a261e", // fond des encadres et des cases vides
  // Accents verts : code, salons, badges, radar
  vertFonce: "#2e3a0c",
  vert: "#b4da4c",
  vertLumineux: "#d7ff5b",
  alerte: "#e0703a", // jauge pleine
  contour: "#000000", // contours sombres et vignette
  // Carte
  quadrillage: "#3a4a10",
  anneau: "#506415",
  bordZone: "#718f1d",
  inconnue: "#000000",
  citoyen: "#ffff00",
  bordCitoyen: "#ff0000",
} as const;

// Teintes des types de zone sur la carte, tirees de la palette MyHordes
export const COULEURS_TYPE_ZONE: Record<string, string> = {
  "Ville en ruines": "#947726",
  Forêt: "#4f7a1f",
  Marécages: "#3e5f55",
  Montagnes: "#696486",
};

// --- Polices ---

export const POLICE_TITRE = "Courier Prime"; // titres, chiffres, etiquettes
export const POLICE_TEXTE = "Nunito"; // texte courant (regles, bienvenue)

const DOSSIER_POLICES = join(__dirname, "..", "..", "assets", "fonts");
const FICHIERS_POLICES = [
  { nom: POLICE_TEXTE, fichier: "nunito-latin-400-normal.woff", graisse: 400, style: "normal" },
  { nom: POLICE_TEXTE, fichier: "nunito-latin-400-italic.woff", graisse: 400, style: "italic" },
  { nom: POLICE_TEXTE, fichier: "nunito-latin-700-normal.woff", graisse: 700, style: "normal" },
  { nom: POLICE_TEXTE, fichier: "nunito-latin-800-normal.woff", graisse: 800, style: "normal" },
  { nom: POLICE_TITRE, fichier: "CourierPrime-Regular.ttf", graisse: 400, style: "normal" },
  { nom: POLICE_TITRE, fichier: "CourierPrime-Bold.ttf", graisse: 700, style: "normal" },
] as const;

// Polices au format satori (images mises en page depuis du Markdown), lues une seule fois
let policesSatori: { name: string; data: Buffer; weight: 400 | 700 | 800; style: "normal" | "italic" }[] | null = null;
export function policesPourSatori() {
  policesSatori ??= FICHIERS_POLICES.map((p) => ({
    name: p.nom,
    data: readFileSync(join(DOSSIER_POLICES, p.fichier)),
    weight: p.graisse,
    style: p.style,
  }));
  return policesSatori;
}

// --- Dimensions communes ---

export const ECHELLE = 1.5; // images rendues 1,5x plus grandes que leur mise en page, nettes une fois reduites par Discord
export const EPAISSEUR_CADRE = 3; // bordure du cadre et trait sous le bandeau de titre
export const TITRE = { taille: 24, espacement: 2 }; // titre en capitales des images SVG (carte, sac)
export const TITRE_SECTION = { taille: 32, espacement: 1 }; // titre des sections de texte (regles, bienvenue)

// --- Briques SVG (carte, sac) ---

export function echapperSvg(texte: string): string {
  return texte.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// Ouverture du SVG et cadre brun a bordure beige ; a fermer par "</svg>"
export function debutSvg(largeur: number, hauteur: number, defs = ""): string {
  const demi = EPAISSEUR_CADRE / 2;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${largeur}" height="${hauteur}" viewBox="0 0 ${largeur} ${hauteur}" font-family="${POLICE_TITRE}">` +
    (defs ? `<defs>${defs}</defs>` : "") +
    `<rect x="${demi}" y="${demi}" width="${largeur - EPAISSEUR_CADRE}" height="${hauteur - EPAISSEUR_CADRE}" ` +
    `fill="${COULEURS.cadre}" stroke="${COULEURS.bord}" stroke-width="${EPAISSEUR_CADRE}"/>`
  );
}

// Titre en capitales, centre dans un bandeau de hauteur "bandeau" en haut de l'image
export function titreSvg(largeur: number, bandeau: number, texte: string): string {
  return (
    `<text x="${largeur / 2}" y="${bandeau / 2 + 9}" text-anchor="middle" font-size="${TITRE.taille}" font-weight="bold" ` +
    `letter-spacing="${TITRE.espacement}" fill="${COULEURS.titre}">${echapperSvg(texte.toUpperCase())}</text>`
  );
}

// Rasterise un SVG en PNG a l'echelle commune
export function svgEnPng(svg: string, largeur: number): Buffer {
  return new Resvg(svg, {
    fitTo: { mode: "width", value: Math.round(largeur * ECHELLE) },
    font: {
      fontFiles: FICHIERS_POLICES.filter((p) => p.nom === POLICE_TITRE).map((p) => join(DOSSIER_POLICES, p.fichier)),
      loadSystemFonts: false,
      defaultFontFamily: POLICE_TITRE,
    },
  })
    .render()
    .asPng();
}
