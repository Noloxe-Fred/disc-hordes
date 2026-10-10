import type { PalierZone } from "@prisma/client";
import { TYPES_ZONE } from "../config/zones";
import type { CaseCarte } from "../services/carte";
import { imageEmoji } from "./emojis";
import { COULEURS, COULEURS_TYPE_ZONE, EPAISSEUR_CADRE, debutSvg, echapperSvg as echapper, svgEnPng, titreSvg } from "./charteImages";

// Rendu PNG de la carte d'un joueur (SVG rasterise par resvg, sans dependance systeme). Disposition calquee
// sur le graphe des zones (services/zones.ts) : la ville au centre, un anneau par palier (proche -> eloignee),
// les 4 types de zone en diagonale dans l'ordre de l'anneau. Chaque lien du graphe est donc soit un rayon
// (ville -> proche -> moyenne -> eloignee d'un meme type), soit un quart d'anneau (types voisins d'un palier).
// Charte inspiree de la carte de MyHordes : ecran radar vert olive quadrille dans un cadre brun, zones
// carrees, zones inconnues en noir, position courante en vert lumineux, citoyens en points jaunes cercles
// de rouge, pieges connus en icone au coin de leur zone. Couleurs, polices et cadre : charte commune des images
// (charteImages.ts).

const LARGEUR = 800;
const HAUTEUR = 850;
const BANDEAU = 56; // bandeau de titre au-dessus de l'ecran radar
const MARGE = 20;
const CX = LARGEUR / 2;
const CY = BANDEAU + (HAUTEUR - BANDEAU - MARGE) / 2 + 2;
const RAYON_ANNEAU = [130, 215, 300]; // proche, moyenne, eloignee
const DEMI_ZONE = 27; // zones carrees de 54 px
const DEMI_VILLE = 46;
// Ville en ruines en haut a gauche, puis sens horaire : foret, marecages, montagnes
const ANGLE_TYPE = [-135, -45, 45, 135].map((deg) => (deg * Math.PI) / 180);
const NOM_ANNEAU = ["PROCHE", "MOYENNE", "ÉLOIGNÉE"];

// Role de chaque couleur de la charte sur la carte
const COULEUR = {
  bordCadre: COULEURS.bord,
  titre: COULEURS.titre,
  radar: COULEURS.vertFonce,
  quadrillage: COULEURS.quadrillage,
  anneau: COULEURS.anneau,
  lienConnu: COULEURS.vert,
  bordZone: COULEURS.bordZone,
  inconnue: COULEURS.inconnue,
  texte: COULEURS.vert,
  ici: COULEURS.vertLumineux,
  ville: COULEURS.filet,
  citoyen: COULEURS.citoyen,
  bordCitoyen: COULEURS.bordCitoyen,
};
const COULEUR_TYPE = COULEURS_TYPE_ZONE;

export interface DonneesRenduCarte {
  nomVille: string;
  enVille: boolean;
  grille: { palier: PalierZone; cases: CaseCarte[] }[];
  // Citoyens de la ville du joueur presents dans chaque zone (joueurs en ville exclus)
  citoyensParZone: Map<number, number>;
  // Zones ou le joueur connait un piege (le sien ou recu en partage de carte)
  pieges: Set<number>;
}

function point(rayon: number, angle: number): { x: number; y: number } {
  return { x: CX + rayon * Math.cos(angle), y: CY + rayon * Math.sin(angle) };
}

function trait(connu: boolean): string {
  return connu
    ? `stroke="${COULEUR.lienConnu}" stroke-width="3"`
    : `stroke="${COULEUR.anneau}" stroke-width="2" stroke-dasharray="5 7"`;
}

function carre(x: number, y: number, demi: number, attributs: string): string {
  return `<rect x="${x - demi}" y="${y - demi}" width="${demi * 2}" height="${demi * 2}" ${attributs}/>`;
}

// Points des citoyens dans une zone : jusqu'a 6 (deux rangees de 3), au-dela un point suivi du nombre
function pointsCitoyens(x: number, y: number, nombre: number): string {
  const rond = (px: number, py: number) =>
    `<circle cx="${px}" cy="${py}" r="5" fill="${COULEUR.citoyen}" stroke="${COULEUR.bordCitoyen}" stroke-width="1.5"/>`;
  if (nombre > 6) {
    return (
      rond(x - 10, y) +
      `<text x="${x + 1}" y="${y + 5}" font-size="15" font-weight="bold" fill="${COULEURS.gras}" stroke="${COULEURS.contour}" stroke-width="3" paint-order="stroke">×${nombre}</text>`
    );
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
    let precedent = { x: CX, y: CY, connu: true };
    donnees.grille.forEach((ligne, p) => {
      const c = ligne.cases[t];
      const pos = point(RAYON_ANNEAU[p], ANGLE_TYPE[t]);
      if (c) liens.push(`<line x1="${precedent.x}" y1="${precedent.y}" x2="${pos.x}" y2="${pos.y}" ${trait(precedent.connu && connue(c))}/>`);
      precedent = { ...pos, connu: c ? connue(c) : false };
    });
  });
  // Quarts d'anneau entre types voisins d'un meme palier
  donnees.grille.forEach((ligne, p) => {
    const r = RAYON_ANNEAU[p];
    ligne.cases.forEach((c, t) => {
      const suivant = ligne.cases[(t + 1) % ligne.cases.length];
      const a = point(r, ANGLE_TYPE[t]);
      const b = point(r, ANGLE_TYPE[(t + 1) % ANGLE_TYPE.length]);
      liens.push(`<path d="M ${a.x} ${a.y} A ${r} ${r} 0 0 1 ${b.x} ${b.y}" fill="none" ${trait(connue(c) && connue(suivant))}/>`);
    });
    noeuds.push(
      `<text x="${CX}" y="${CY - r - 7}" text-anchor="middle" font-size="13" letter-spacing="2" fill="${COULEUR.bordZone}">${NOM_ANNEAU[p]}</text>`,
    );
  });

  // Zones
  donnees.grille.forEach((ligne, p) => {
    ligne.cases.forEach((c, t) => {
      const { x, y } = point(RAYON_ANNEAU[p], ANGLE_TYPE[t]);
      const citoyens = donnees.citoyensParZone.get(c.zoneId) ?? 0;
      if (c.ici) {
        noeuds.push(carre(x, y, DEMI_ZONE + 7, `fill="none" stroke="${COULEUR.ici}" stroke-width="4" filter="url(#lueur)"`));
      }
      if (connue(c)) {
        noeuds.push(
          carre(x, y, DEMI_ZONE, `fill="${COULEUR_TYPE[c.nomType] ?? COULEUR.radar}" stroke="${COULEURS.contour}" stroke-width="2"`),
          carre(x, y, DEMI_ZONE - 4, `fill="none" stroke="${COULEUR.bordZone}" stroke-width="1"`),
        );
      } else {
        noeuds.push(carre(x, y, DEMI_ZONE, `fill="${COULEUR.inconnue}" stroke="${COULEUR.anneau}" stroke-width="2"`));
      }
      // Piege connu : icone dans le coin superieur droit de la zone, a cheval sur son bord
      if (donnees.pieges.has(c.zoneId)) {
        noeuds.push(
          `<circle cx="${x + DEMI_ZONE}" cy="${y - DEMI_ZONE}" r="15" fill="${COULEURS.contour}" stroke="${COULEUR.bordZone}" stroke-width="1.5"/>` +
            `<image x="${x + DEMI_ZONE - 11}" y="${y - DEMI_ZONE - 11}" width="22" height="22" href="${imageEmoji("🪤")}"/>`,
        );
      }
      if (citoyens > 0) noeuds.push(pointsCitoyens(x, y, citoyens));
      else if (!connue(c)) {
        noeuds.push(`<text x="${x}" y="${y + 8}" text-anchor="middle" font-size="24" font-weight="bold" fill="${COULEUR.anneau}">?</text>`);
      }
    });
  });

  // Ville au centre. Le nom doit tenir dans la case : police reduite au-dela de 8 caracteres, coupe au-dela de 11
  const nomVille = donnees.nomVille.length > 11 ? `${donnees.nomVille.slice(0, 10)}…` : donnees.nomVille;
  const policeVille = nomVille.length > 8 ? 13 : 16;
  if (donnees.enVille) {
    noeuds.push(carre(CX, CY, DEMI_VILLE + 8, `fill="none" stroke="${COULEUR.ici}" stroke-width="4" filter="url(#lueur)"`));
  }
  noeuds.push(
    carre(CX, CY, DEMI_VILLE, `fill="${COULEUR.ville}" stroke="${COULEUR.bordCadre}" stroke-width="3"`),
    `<text x="${CX}" y="${CY + 5}" text-anchor="middle" font-size="${policeVille}" font-weight="bold" fill="${COULEUR.titre}">${echapper(nomVille)}</text>`,
  );

  // Nom des types dans les coins de l'ecran radar
  const etiquettes = TYPES_ZONE.map((type, t) => {
    const { x, y } = point(RAYON_ANNEAU[2] + 72, ANGLE_TYPE[t]);
    return `<text x="${x}" y="${y + 6}" text-anchor="middle" font-size="18" font-weight="bold" fill="${COULEUR.texte}">${echapper(type.nom.toUpperCase())}</text>`;
  });

  // Quadrillage de l'ecran radar, un trait tous les 40 px
  const ecran = { x: MARGE, y: BANDEAU, l: LARGEUR - 2 * MARGE, h: HAUTEUR - BANDEAU - MARGE };
  const quadrillage: string[] = [];
  for (let x = ecran.x + 40; x < ecran.x + ecran.l; x += 40) {
    quadrillage.push(`<line x1="${x}" y1="${ecran.y}" x2="${x}" y2="${ecran.y + ecran.h}"/>`);
  }
  for (let y = ecran.y + 40; y < ecran.y + ecran.h; y += 40) {
    quadrillage.push(`<line x1="${ecran.x}" y1="${y}" x2="${ecran.x + ecran.l}" y2="${y}"/>`);
  }

  return (
    debutSvg(
      LARGEUR,
      HAUTEUR,
      `<filter id="lueur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3" result="flou"/>` +
    `<feMerge><feMergeNode in="flou"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` +
    `<radialGradient id="vignette" cx="50%" cy="50%" r="70%"><stop offset="60%" stop-color="${COULEURS.contour}" stop-opacity="0"/>` +
        `<stop offset="100%" stop-color="${COULEURS.contour}" stop-opacity="0.55"/></radialGradient>`,
    ) +
    titreSvg(LARGEUR, BANDEAU, `CARTE — ${donnees.nomVille.length > 36 ? `${donnees.nomVille.slice(0, 35)}…` : donnees.nomVille}`) +
    // Ecran radar
    `<rect x="${ecran.x}" y="${ecran.y}" width="${ecran.l}" height="${ecran.h}" fill="${COULEUR.radar}"/>` +
    `<g stroke="${COULEUR.quadrillage}" stroke-width="1">${quadrillage.join("")}</g>` +
    liens.join("") +
    noeuds.join("") +
    etiquettes.join("") +
    `<rect x="${ecran.x}" y="${ecran.y}" width="${ecran.l}" height="${ecran.h}" fill="url(#vignette)"/>` +
    `<rect x="${ecran.x}" y="${ecran.y}" width="${ecran.l}" height="${ecran.h}" fill="none" stroke="${COULEUR.bordCadre}" stroke-width="${EPAISSEUR_CADRE - 1}"/>` +
    `</svg>`
  );
}

export function rendreCarte(donnees: DonneesRenduCarte): Promise<Buffer> {
  return svgEnPng(construireSvgCarte(donnees), LARGEUR);
}
