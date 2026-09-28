import { join } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import { TypeObjet } from "@prisma/client";
import { emojiObjet } from "../config/objets";
import { imageEmoji } from "./emojis";

// Rendu PNG du sac d'un joueur (SVG rasterise par resvg), dans la charte MyHordes de la carte et des regles :
// cadre brun a bordure beige, titre creme en Courier Prime. Les objets sont ranges par famille (ressources,
// objets fabriques, objets rares), une case par objet avec son icone Twemoji et sa quantite ; la derniere
// rangee de chaque famille est completee de cases vides, comme les emplacements du sac de MyHordes. Sous le titre,
// un bandeau reunit les PA, la jauge de charge (poids des objets sur la capacite, orange quand elle est atteinte) et
// les equipements portes hors du sac, comme la radio.

const POLICES = ["CourierPrime-Regular.ttf", "CourierPrime-Bold.ttf"].map((f) => join(__dirname, "../../assets/fonts", f));

const COLONNES = 6;
const CASE = 88;
const ESPACE = 14;
const ETIQUETTE = 36; // nom de l'objet sous la case, sur deux lignes au plus
const MARGE = 24;
const BANDEAU = 58;
const TITRE_FAMILLE = 34;
const ICONE = 54;
const ENTETE = 56; // bandeau PA, charge et equipements, sous le titre
const CASE_EQUIPEMENT = 44;
const ICONE_EQUIPEMENT = 30;
const LARGEUR = 2 * MARGE + COLONNES * CASE + (COLONNES - 1) * ESPACE;
const ECHELLE = 1.5; // image nette une fois reduite par Discord

const COULEUR = {
  cadre: "#5c2b20",
  bordCadre: "#ddab76",
  titre: "#f0d79e",
  famille: "#ddab76",
  filet: "#7e4d2a",
  case: "#3e2417",
  bordCase: "#7e4d2a",
  caseVide: "#4a261e",
  texte: "#f8eacb",
  badge: "#2e3a0c",
  bordBadge: "#b4da4c",
  quantite: "#d7ff5b",
  fondJauge: "#3e2417",
  jauge: "#b4da4c",
  jaugePleine: "#e0703a",
};

const FAMILLES: { titre: string; types: TypeObjet[] }[] = [
  { titre: "RESSOURCES", types: [TypeObjet.RESSOURCE_BRUTE] },
  { titre: "OBJETS FABRIQUÉS", types: [TypeObjet.CRAFT_SIMPLE, TypeObjet.CRAFT_AVANCE] },
  { titre: "OBJETS RARES", types: [TypeObjet.RARE] },
];

export interface ObjetSac {
  nom: string;
  type: TypeObjet;
  quantite: number;
}

function echapper(texte: string): string {
  return texte.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function couper(texte: string, max: number): string {
  return texte.length > max ? `${texte.slice(0, max - 1)}…` : texte;
}

// Nom d'un objet sur deux lignes au plus, coupees entre les mots
function lignesNom(nom: string, max = 13): string[] {
  const lignes: string[] = [];
  for (const mot of nom.split(" ")) {
    const derniere = lignes[lignes.length - 1];
    if (derniere !== undefined && derniere.length + 1 + mot.length <= max) lignes[lignes.length - 1] = `${derniere} ${mot}`;
    else lignes.push(mot);
  }
  return lignes.length > 2 ? [lignes[0], couper(lignes.slice(1).join(" "), max)] : lignes.map((l) => couper(l, max));
}

function caseObjet(x: number, y: number, objet: ObjetSac | null): string {
  if (!objet) {
    return `<rect x="${x}" y="${y}" width="${CASE}" height="${CASE}" rx="6" fill="${COULEUR.caseVide}" stroke="${COULEUR.bordCase}" stroke-width="1" stroke-dasharray="4 4"/>`;
  }
  const quantite = `×${objet.quantite}`;
  const largeurBadge = 14 + quantite.length * 10;
  return (
    `<rect x="${x}" y="${y}" width="${CASE}" height="${CASE}" rx="6" fill="${COULEUR.case}" stroke="${COULEUR.bordCadre}" stroke-width="2"/>` +
    `<image x="${x + (CASE - ICONE) / 2}" y="${y + (CASE - ICONE) / 2 - 4}" width="${ICONE}" height="${ICONE}" href="${imageEmoji(emojiObjet(objet.nom))}"/>` +
    `<rect x="${x + CASE - largeurBadge - 4}" y="${y + CASE - 26}" width="${largeurBadge}" height="22" rx="4" fill="${COULEUR.badge}" stroke="${COULEUR.bordBadge}" stroke-width="1.5"/>` +
    `<text x="${x + CASE - 4 - largeurBadge / 2}" y="${y + CASE - 10}" text-anchor="middle" font-size="16" font-weight="bold" fill="${COULEUR.quantite}">${quantite}</text>` +
    lignesNom(objet.nom)
      .map(
        (ligne, i) =>
          `<text x="${x + CASE / 2}" y="${y + CASE + 16 + i * 14}" text-anchor="middle" font-size="12" fill="${COULEUR.texte}">${echapper(ligne)}</text>`,
      )
      .join("")
  );
}

export interface ChargeInventaire {
  utilisee: number;
  capacite: number;
}

export interface EnteteInventaire {
  pa?: number;
  charge?: ChargeInventaire;
  equipements?: ObjetSac[]; // portes hors du sac, sans poids
}

function caseEquipement(x: number, y: number, objet: ObjetSac): string {
  const decalage = (CASE_EQUIPEMENT - ICONE_EQUIPEMENT) / 2;
  return (
    `<rect x="${x}" y="${y}" width="${CASE_EQUIPEMENT}" height="${CASE_EQUIPEMENT}" rx="6" fill="${COULEUR.case}" stroke="${COULEUR.bordBadge}" stroke-width="2"/>` +
    `<image x="${x + decalage}" y="${y + decalage}" width="${ICONE_EQUIPEMENT}" height="${ICONE_EQUIPEMENT}" href="${imageEmoji(emojiObjet(objet.nom))}"/>` +
    (objet.quantite > 1
      ? `<text x="${x + CASE_EQUIPEMENT - 4}" y="${y + CASE_EQUIPEMENT - 4}" text-anchor="end" font-size="13" font-weight="bold" fill="${COULEUR.quantite}">×${objet.quantite}</text>`
      : "")
  );
}

// PA a gauche, equipements a droite, jauge de charge entre les deux
function bandeauEntete(y: number, entete: EnteteInventaire): string {
  const elements: string[] = [];
  const milieu = y + CASE_EQUIPEMENT / 2;
  let x = MARGE;
  let fin = LARGEUR - MARGE;

  if (entete.pa !== undefined) {
    elements.push(`<text x="${x}" y="${milieu + 6}" font-size="18" font-weight="bold" letter-spacing="1" fill="${COULEUR.titre}">PA ${entete.pa}</text>`);
    x += 110;
  }
  for (const objet of [...(entete.equipements ?? [])].reverse()) {
    fin -= CASE_EQUIPEMENT;
    elements.push(caseEquipement(fin, y, objet));
    fin -= 10;
  }
  if (entete.charge) {
    const { utilisee, capacite } = entete.charge;
    const xBarre = x + 190;
    const largeurBarre = Math.max(0, fin - xBarre);
    const remplie = Math.round(largeurBarre * Math.min(1, utilisee / capacite));
    const couleur = utilisee >= capacite ? COULEUR.jaugePleine : COULEUR.jauge;
    elements.push(
      `<text x="${x}" y="${milieu + 6}" font-size="16" font-weight="bold" letter-spacing="1" fill="${COULEUR.famille}">CHARGE ${utilisee} / ${capacite}</text>`,
      `<rect x="${xBarre}" y="${milieu - 10}" width="${largeurBarre}" height="20" rx="4" fill="${COULEUR.fondJauge}" stroke="${COULEUR.bordCase}" stroke-width="1.5"/>`,
      remplie > 0 ? `<rect x="${xBarre}" y="${milieu - 10}" width="${remplie}" height="20" rx="4" fill="${couleur}"/>` : "",
    );
  }
  return elements.join("");
}

export function construireSvgInventaire(titre: string, objets: ObjetSac[], entete: EnteteInventaire = {}): string {
  const elements: string[] = [];
  let y = BANDEAU + 10;
  if (entete.pa !== undefined || entete.charge || entete.equipements?.length) {
    elements.push(bandeauEntete(y, entete));
    y += ENTETE;
  }
  const hauteurRangee = CASE + ETIQUETTE + ESPACE;

  const familles = FAMILLES.map((f) => ({
    titre: f.titre,
    objets: objets.filter((o) => f.types.includes(o.type)).sort((a, b) => a.nom.localeCompare(b.nom, "fr")),
  })).filter((f) => f.objets.length > 0);

  if (familles.length === 0) {
    // Sac vide : une rangee d'emplacements libres
    for (let c = 0; c < COLONNES; c++) elements.push(caseObjet(MARGE + c * (CASE + ESPACE), y, null));
    elements.push(
      `<text x="${LARGEUR / 2}" y="${y + CASE / 2 + 7}" text-anchor="middle" font-size="20" font-weight="bold" letter-spacing="2" fill="${COULEUR.famille}">SAC VIDE</text>`,
    );
    y += CASE + ESPACE;
  }

  for (const famille of familles) {
    elements.push(
      `<text x="${MARGE}" y="${y + 20}" font-size="15" font-weight="bold" letter-spacing="2" fill="${COULEUR.famille}">${famille.titre}</text>`,
      `<line x1="${MARGE}" y1="${y + 28}" x2="${LARGEUR - MARGE}" y2="${y + 28}" stroke="${COULEUR.filet}" stroke-width="1.5"/>`,
    );
    y += TITRE_FAMILLE;
    const rangees = Math.ceil(famille.objets.length / COLONNES);
    for (let i = 0; i < rangees * COLONNES; i++) {
      const x = MARGE + (i % COLONNES) * (CASE + ESPACE);
      elements.push(caseObjet(x, y + Math.floor(i / COLONNES) * hauteurRangee, famille.objets[i] ?? null));
    }
    y += rangees * hauteurRangee;
  }

  const hauteur = y + MARGE - ESPACE;
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${LARGEUR}" height="${hauteur}" viewBox="0 0 ${LARGEUR} ${hauteur}" font-family="Courier Prime">` +
    `<rect x="1" y="1" width="${LARGEUR - 2}" height="${hauteur - 2}" fill="${COULEUR.cadre}" stroke="${COULEUR.bordCadre}" stroke-width="2"/>` +
    `<text x="${LARGEUR / 2}" y="${BANDEAU / 2 + 9}" text-anchor="middle" font-size="24" font-weight="bold" letter-spacing="2" fill="${COULEUR.titre}">` +
    `${echapper(couper(titre, 36).toUpperCase())}</text>` +
    `<line x1="${MARGE}" y1="${BANDEAU}" x2="${LARGEUR - MARGE}" y2="${BANDEAU}" stroke="${COULEUR.bordCadre}" stroke-width="2"/>` +
    elements.join("") +
    `</svg>`
  );
}

export function rendreInventaire(titre: string, objets: ObjetSac[], entete: EnteteInventaire = {}): Buffer {
  const resvg = new Resvg(construireSvgInventaire(titre, objets, entete), {
    fitTo: { mode: "width", value: Math.round(LARGEUR * ECHELLE) },
    font: { fontFiles: POLICES, loadSystemFonts: false, defaultFontFamily: "Courier Prime" },
  });
  return resvg.render().asPng();
}
