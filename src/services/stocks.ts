import { REGENERATION_NATURELLE, STOCK_FINI_DEPART, STOCK_NATUREL_MAX } from "../config/stocks";
import { prisma } from "../db";
import { stocksActuels } from "../game/stocks";

// Stocks des zones d'un groupe (equilibrage.md §5)

// Une regeneration au plus par aube pour un groupe, meme si plusieurs de ses villes basculent (ou qu'un admin force
// une aube de plus dans la foulee)
const ECART_MIN_REGENERATIONS_MS = 12 * 3_600_000;

// Aube : +40 % du max de ressources naturelles dans chaque zone du groupe, plafonne au max
export async function regenererRessourcesNaturelles(groupeId: number): Promise<void> {
  const groupe = await prisma.groupe.findUnique({ where: { id: groupeId }, include: { zones: true } });
  if (!groupe) return;
  if (groupe.derniereRegenRessources && Date.now() - groupe.derniereRegenRessources.getTime() < ECART_MIN_REGENERATIONS_MS) return;
  await prisma.$transaction([
    ...groupe.zones.map((zone) => {
      const max = STOCK_NATUREL_MAX[zone.palier];
      const naturel = Math.min(max, stocksActuels(zone).naturel + Math.ceil(max * REGENERATION_NATURELLE));
      return prisma.zone.update({ where: { id: zone.id }, data: { stockNaturel: naturel } });
    }),
    prisma.groupe.update({ where: { id: groupeId }, data: { derniereRegenRessources: new Date() } }),
  ]);
}

// Recharge par un MJ ou un Admin (a la place des evenements IA prevus) : stocks remis a leur maximum / valeur de depart
export async function rechargerZones(zoneIds: number[], stocks: { naturel: boolean; fini: boolean }): Promise<number> {
  const zones = await prisma.zone.findMany({ where: { id: { in: zoneIds } } });
  await prisma.$transaction(
    zones.map((zone) =>
      prisma.zone.update({
        where: { id: zone.id },
        data: {
          ...(stocks.naturel ? { stockNaturel: STOCK_NATUREL_MAX[zone.palier] } : {}),
          ...(stocks.fini ? { stockFini: STOCK_FINI_DEPART[zone.palier] } : {}),
        },
      }),
    ),
  );
  return zones.length;
}
