import { Metier, PrismaClient, TypeObjet } from "@prisma/client";

const prisma = new PrismaClient();

// Ressources brutes — equilibrage.md §5 ("Onze ressources de base")
const RESSOURCES_BRUTES: { nom: string; regenerant?: boolean }[] = [
  { nom: "Bois", regenerant: true },
  { nom: "Tissu" },
  { nom: "Ferraille" },
  { nom: "Pierre" },
  { nom: "Eau brute" },
  { nom: "Baies", regenerant: true },
  { nom: "Gibier", regenerant: true },
  { nom: "Plante médicinale" },
  { nom: "Pièces mécaniques" },
  { nom: "Ingrédient de remède" },
  { nom: "Munitions" },
];

// Loot rare sans recette — equilibrage.md §5
const OBJETS_RARES: string[] = ["Radio"];

// Objets de loot catalogues (equilibrage.md §5) mais sans effet mecanique defini pour
// l'instant : tirables et stockables des la V1, comportement a trancher plus tard (§12).
const OBJETS_SANS_MECANIQUE: string[] = [
  "Médicament basique",
  "Arme simple",
  "Arme avancée",
  "Petit gibier",
  "Gros gibier",
  "Gibier rare",
  "Bois rare",
  "Minerai rare",
  "Pièces mécaniques rouillées",
  "Pièces pour voiture",
  "Objet rare",
];

interface RecetteSeed {
  nom: string;
  ingredients: { nom: string; quantite: number }[];
  coutPA?: number;
  requiertAtelier?: boolean;
  palierAtelierRequis?: number;
  metierExclusif?: Metier;
}

// Craft simple, ouvert a tous — equilibrage.md §6
const RECETTES_SIMPLES: RecetteSeed[] = [
  { nom: "Bandage", ingredients: [{ nom: "Tissu", quantite: 2 }], coutPA: 1 },
  {
    nom: "Plat préparé",
    ingredients: [
      { nom: "Baies", quantite: 1 },
      { nom: "Gibier", quantite: 1 },
    ],
    coutPA: 1,
  },
  { nom: "Feu", ingredients: [{ nom: "Bois", quantite: 2 }], coutPA: 1 },
  {
    nom: "Arme de fortune",
    ingredients: [
      { nom: "Ferraille", quantite: 1 },
      { nom: "Bois", quantite: 1 },
    ],
    coutPA: 1,
  },
  {
    nom: "Ration d'eau purifiée",
    ingredients: [
      { nom: "Eau brute", quantite: 2 },
      { nom: "Tissu", quantite: 1 },
    ],
    coutPA: 1,
  },
  {
    nom: "Torche",
    ingredients: [
      { nom: "Bois", quantite: 1 },
      { nom: "Tissu", quantite: 1 },
    ],
    coutPA: 1,
  },
  {
    nom: "Piège simple",
    ingredients: [
      { nom: "Bois", quantite: 2 },
      { nom: "Ferraille", quantite: 1 },
    ],
    coutPA: 1,
  },
];

// Craft avance, atelier requis, une recette exclusive par metier — equilibrage.md §8
const RECETTES_AVANCEES: RecetteSeed[] = [
  {
    nom: "Remède contre l'infection",
    ingredients: [
      { nom: "Plante médicinale", quantite: 2 },
      { nom: "Ingrédient de remède", quantite: 1 },
      { nom: "Ration d'eau purifiée", quantite: 1 },
    ],
    coutPA: 6,
    requiertAtelier: true,
    palierAtelierRequis: 1,
    metierExclusif: Metier.MEDECIN,
  },
  {
    nom: "Réparation voiture",
    ingredients: [
      { nom: "Pièces mécaniques", quantite: 4 },
      { nom: "Ferraille", quantite: 2 },
    ],
    coutPA: 8,
    requiertAtelier: true,
    palierAtelierRequis: 1,
    metierExclusif: Metier.INGENIEUR,
  },
  {
    nom: "Structures de défense avancées",
    ingredients: [
      { nom: "Ferraille", quantite: 3 },
      { nom: "Bois", quantite: 3 },
      { nom: "Pierre", quantite: 2 },
    ],
    coutPA: 8,
    requiertAtelier: true,
    palierAtelierRequis: 1,
    metierExclusif: Metier.INGENIEUR,
  },
  {
    nom: "Ragoût fortifiant",
    ingredients: [
      { nom: "Gibier", quantite: 1 },
      { nom: "Baies", quantite: 2 },
      { nom: "Ration d'eau purifiée", quantite: 1 },
    ],
    coutPA: 5,
    requiertAtelier: true,
    palierAtelierRequis: 1,
    metierExclusif: Metier.CUISINIER,
  },
  {
    nom: "Conserve longue durée",
    ingredients: [
      { nom: "Gibier", quantite: 2 },
      { nom: "Tissu", quantite: 1 },
    ],
    coutPA: 4,
    requiertAtelier: true,
    palierAtelierRequis: 1,
    metierExclusif: Metier.CUISINIER,
  },
  {
    nom: "Infusion médicinale",
    ingredients: [
      { nom: "Plante médicinale", quantite: 1 },
      { nom: "Ration d'eau purifiée", quantite: 1 },
    ],
    coutPA: 4,
    requiertAtelier: true,
    palierAtelierRequis: 1,
    metierExclusif: Metier.CUISINIER,
  },
  {
    nom: "Pièges avancés",
    ingredients: [
      { nom: "Ferraille", quantite: 2 },
      { nom: "Bois", quantite: 2 },
      { nom: "Gibier", quantite: 1 },
    ],
    coutPA: 5,
    requiertAtelier: true,
    palierAtelierRequis: 1,
    metierExclusif: Metier.CHASSEUR,
  },
  {
    nom: "Armes/outils avancés",
    ingredients: [
      { nom: "Ferraille", quantite: 3 },
      { nom: "Bois", quantite: 2 },
      { nom: "Pièces mécaniques", quantite: 1 },
    ],
    coutPA: 6,
    requiertAtelier: true,
    palierAtelierRequis: 1,
    metierExclusif: Metier.ARTISAN,
  },
];

async function seedObjets() {
  for (const { nom, regenerant } of RESSOURCES_BRUTES) {
    await prisma.objet.upsert({
      where: { nom },
      update: { type: TypeObjet.RESSOURCE_BRUTE, regenerant: regenerant ?? false },
      create: { nom, type: TypeObjet.RESSOURCE_BRUTE, regenerant: regenerant ?? false },
    });
  }

  for (const nom of [...OBJETS_RARES, ...OBJETS_SANS_MECANIQUE]) {
    await prisma.objet.upsert({
      where: { nom },
      update: { type: TypeObjet.RARE },
      create: { nom, type: TypeObjet.RARE },
    });
  }
}

async function seedRecettes(recettes: RecetteSeed[], type: TypeObjet) {
  for (const recette of recettes) {
    const objetResultat = await prisma.objet.upsert({
      where: { nom: recette.nom },
      update: { type },
      create: { nom: recette.nom, type },
    });

    await prisma.recetteIngredient.deleteMany({
      where: { recette: { objetResultatId: objetResultat.id } },
    });

    const recetteRow = await prisma.recette.upsert({
      where: { objetResultatId: objetResultat.id },
      update: {
        coutPA: recette.coutPA,
        requiertAtelier: recette.requiertAtelier ?? false,
        palierAtelierRequis: recette.palierAtelierRequis,
        metierExclusif: recette.metierExclusif,
      },
      create: {
        objetResultatId: objetResultat.id,
        coutPA: recette.coutPA,
        requiertAtelier: recette.requiertAtelier ?? false,
        palierAtelierRequis: recette.palierAtelierRequis,
        metierExclusif: recette.metierExclusif,
      },
    });

    for (const ingredient of recette.ingredients) {
      const objetIngredient = await prisma.objet.findUniqueOrThrow({ where: { nom: ingredient.nom } });
      await prisma.recetteIngredient.create({
        data: {
          recetteId: recetteRow.id,
          objetId: objetIngredient.id,
          quantite: ingredient.quantite,
        },
      });
    }
  }
}

async function main() {
  await seedObjets();
  await seedRecettes(RECETTES_SIMPLES, TypeObjet.CRAFT_SIMPLE);
  await seedRecettes(RECETTES_AVANCEES, TypeObjet.CRAFT_AVANCE);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
