import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import type { PalierZone } from "@prisma/client";
import { TYPES_ZONE } from "../config/zones";
import type { CaseCarte } from "../services/carte";

// Rendu PNG de la carte d'un joueur (SVG rasterise par resvg, sans dependance systeme). Disposition calquee
// sur le graphe des zones (services/zones.ts) : la ville au centre, un anneau par palier (proche -> eloignee),
// les 4 types de zone en diagonale dans l'ordre de l'anneau. Chaque lien du graphe est donc soit un rayon
// (ville -> proche -> moyenne -> eloignee d'un meme type), soit un quart d'anneau (types voisins d'un palier).

const POLICES = ["PT_Sans-Web-Regular.ttf", "PT_Sans-Web-Bold.ttf"].map((f) => join(__dirname, "../../assets/fonts", f));

const TAILLE = 800;
const CENTRE = TAILLE / 2;
const RAYON_ANNEAU = [130, 215, 300]; // proche, moyenne, eloignee
const RAYON_ZONE = 30;
const RAYON_VILLE = 50;
// Ville en ruines en haut a gauche, puis sens horaire : foret, marecages, montagnes
const ANGLE_TYPE = [-135, -45, 45, 135].map((deg) => (deg * Math.PI) / 180);
const NOM_ANNEAU = ["proche", "moyenne", "éloignée"];

const COULEUR = {
  fond: "#17160f",
  cadre: "#3a362e",
  lienConnu: "#a89a7c",
  lienInconnu: "#3a362e",
  inconnue: "#26241f",
  bordInconnue: "#5a5345",
  texte: "#e8e0cc",
  texteDiscret: "#8a8170",
  ici: "#f2c14e",
  ville: "#9c6b45",
  citoyen: "#4ea8ff",
};
const COULEUR_TYPE: Record<string, string> = {
  "Ville en ruines": "#8d7b68",
  Forêt: "#4f7d4a",
  Marécages: "#4a7a78",
  Montagnes: "#6f7890",
};

export interface DonneesRenduCarte {
  nomVille: string;
  enVille: boolean;
  grille: { palier: PalierZone; cases: CaseCarte[] }[];
  // Citoyens de la ville du joueur presents dans chaque zone (joueurs en ville exclus)
  citoyensParZone: Map<number, number>;
}

function echapper(texte: string): string {
  return texte.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function point(rayon: number, angle: number): { x: number; y: number } {
  return { x: CENTRE + rayon * Math.cos(angle), y: CENTRE + rayon * Math.sin(angle) };
}

function lien(x1: number, y1: number, x2: number, y2: number, connu: boolean): string {
  return connu
    ? `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${COULEUR.lienConnu}" stroke-width="3"/>`
    : `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${COULEUR.lienInconnu}" stroke-width="2" stroke-dasharray="6 6"/>`;
}

function arc(rayon: number, angleA: number, angleB: number, connu: boolean): string {
  const a = point(rayon, angleA);
  const b = point(rayon, angleB);
  const trait = connu
    ? `stroke="${COULEUR.lienConnu}" stroke-width="3"`
    : `stroke="${COULEUR.lienInconnu}" stroke-width="2" stroke-dasharray="6 6"`;
  return `<path d="M ${a.x} ${a.y} A ${rayon} ${rayon} 0 0 1 ${b.x} ${b.y}" fill="none" ${trait}/>`;
}

// Points des citoyens dans une zone : jusqu'a 6 (deux rangees de 3), au-dela un point suivi du nombre
function pointsCitoyens(x: number, y: number, nombre: number): string {
  const rond = (px: number, py: number) =>
    `<circle cx="${px}" cy="${py}" r="5.5" fill="${COULEUR.citoyen}" stroke="#0b1d33" stroke-width="1.5"/>`;
  if (nombre > 6) {
    return rond(x - 10, y) + `<text x="${x + 2}" y="${y + 5}" font-size="15" font-weight="bold" fill="${COULEUR.texte}">×${nombre}</text>`;
  }
  const rangees = nombre > 3 ? [Math.ceil(nombre / 2), Math.floor(nombre / 2)] : [nombre];
  return rangees
    .map((n, r) => {
      const py = rangees.length === 1 ? y : y + (r === 0 ? -7 : 7);
      return Array.from({ length: n }, (_, i) => rond(x + (i - (n - 1) / 2) * 13, py)).join("");
    })
    .join("");
}

export function construireSvgCarte(donnees: DonneesRenduCarte): string {
  const liens: string[] = [];
  const noeuds: string[] = [];
  const connue = (c: CaseCarte) => c.decouverte || c.ici;

  // Rayons : ville -> proche, puis proche -> moyenne -> eloignee pour chaque type
  TYPES_ZONE.forEach((_, t) => {
    let precedent = { x: CENTRE, y: CENTRE, connu: true };
    donnees.grille.forEach((ligne, p) => {
      const c = ligne.cases[t];
      const pos = point(RAYON_ANNEAU[p], ANGLE_TYPE[t]);
      if (c) liens.push(lien(precedent.x, precedent.y, pos.x, pos.y, precedent.connu && connue(c)));
      precedent = { ...pos, connu: c ? connue(c) : false };
    });
  });
  // Quarts d'anneau entre types voisins d'un meme palier
  donnees.grille.forEach((ligne, p) => {
    ligne.cases.forEach((c, t) => {
      const suivant = ligne.cases[(t + 1) % ligne.cases.length];
      liens.push(arc(RAYON_ANNEAU[p], ANGLE_TYPE[t], ANGLE_TYPE[(t + 1) % ANGLE_TYPE.length], connue(c) && connue(suivant)));
    });
    const haut = CENTRE - RAYON_ANNEAU[p];
    noeuds.push(
      `<text x="${CENTRE}" y="${haut - 8}" text-anchor="middle" font-size="13" fill="${COULEUR.texteDiscret}">${NOM_ANNEAU[p]}</text>`,
    );
  });

  // Zones
  donnees.grille.forEach((ligne, p) => {
    ligne.cases.forEach((c, t) => {
      const { x, y } = point(RAYON_ANNEAU[p], ANGLE_TYPE[t]);
      const citoyens = donnees.citoyensParZone.get(c.zoneId) ?? 0;
      if (c.ici) noeuds.push(`<circle cx="${x}" cy="${y}" r="${RAYON_ZONE + 8}" fill="none" stroke="${COULEUR.ici}" stroke-width="5"/>`);
      noeuds.push(
        connue(c)
          ? `<circle cx="${x}" cy="${y}" r="${RAYON_ZONE}" fill="${COULEUR_TYPE[c.nomType] ?? COULEUR.inconnue}" stroke="${COULEUR.texte}" stroke-width="2"/>`
          : `<circle cx="${x}" cy="${y}" r="${RAYON_ZONE}" fill="${COULEUR.inconnue}" stroke="${COULEUR.bordInconnue}" stroke-width="2" stroke-dasharray="4 4"/>`,
      );
      if (citoyens > 0) noeuds.push(pointsCitoyens(x, y, citoyens));
      else if (!connue(c)) noeuds.push(`<text x="${x}" y="${y + 8}" text-anchor="middle" font-size="24" font-weight="bold" fill="${COULEUR.bordInconnue}">?</text>`);
    });
  });

  // Ville au centre
  // Le nom doit tenir dans le cercle de la ville : police reduite au-dela de 9 caracteres, coupe au-dela de 13
  const nomVille = donnees.nomVille.length > 13 ? `${donnees.nomVille.slice(0, 12)}…` : donnees.nomVille;
  const policeVille = nomVille.length > 9 ? 13 : 16;
  if (donnees.enVille) noeuds.push(`<circle cx="${CENTRE}" cy="${CENTRE}" r="${RAYON_VILLE + 8}" fill="none" stroke="${COULEUR.ici}" stroke-width="5"/>`);
  noeuds.push(
    `<circle cx="${CENTRE}" cy="${CENTRE}" r="${RAYON_VILLE}" fill="${COULEUR.ville}" stroke="${COULEUR.texte}" stroke-width="2"/>`,
    `<text x="${CENTRE}" y="${CENTRE + 5}" text-anchor="middle" font-size="${policeVille}" font-weight="bold" fill="${COULEUR.texte}">${echapper(nomVille)}</text>`,
  );

  // Nom des types dans les coins
  const etiquettes = TYPES_ZONE.map((type, t) => {
    const { x, y } = point(RAYON_ANNEAU[2] + 72, ANGLE_TYPE[t]);
    return `<text x="${x}" y="${y + 7}" text-anchor="middle" font-size="20" font-weight="bold" letter-spacing="1" fill="${COULEUR_TYPE[type.nom]}">${echapper(type.nom.toUpperCase())}</text>`;
  });

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${TAILLE}" height="${TAILLE}" viewBox="0 0 ${TAILLE} ${TAILLE}" font-family="PT Sans">` +
    `<rect width="${TAILLE}" height="${TAILLE}" fill="${COULEUR.fond}"/>` +
    `<rect x="10" y="10" width="${TAILLE - 20}" height="${TAILLE - 20}" fill="none" stroke="${COULEUR.cadre}" stroke-width="2"/>` +
    liens.join("") +
    noeuds.join("") +
    etiquettes.join("") +
    `</svg>`
  );
}

export function rendreCarte(donnees: DonneesRenduCarte): Buffer {
  const resvg = new Resvg(construireSvgCarte(donnees), {
    font: { fontFiles: POLICES, loadSystemFonts: false, defaultFontFamily: "PT Sans" },
  });
  return resvg.render().asPng();
}
