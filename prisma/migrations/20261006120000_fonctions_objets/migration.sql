-- Fonctions des objets sans effet (equilibrage.md §5) : nom de recette (plusieurs recettes peuvent donner le meme
-- objet, ex. « Dérouiller des pièces »), appat des pieges, structures de defense renforcees

-- Recette : nom unique, rempli avec le nom de l'objet produit pour les recettes existantes
ALTER TABLE `Recette` ADD COLUMN `nom` VARCHAR(191) NULL;
UPDATE `Recette` r JOIN `Objet` o ON o.`id` = r.`objetResultatId` SET r.`nom` = o.`nom`;
ALTER TABLE `Recette` MODIFY `nom` VARCHAR(191) NOT NULL;
CREATE UNIQUE INDEX `Recette_nom_key` ON `Recette`(`nom`);

-- L'objet produit n'est plus unique : index simple pour la cle etrangere, puis retrait de l'index unique
CREATE INDEX `Recette_objetResultatId_fkey` ON `Recette`(`objetResultatId`);
DROP INDEX `Recette_objetResultatId_key` ON `Recette`;

-- AlterTable
ALTER TABLE `Piege` ADD COLUMN `appate` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `Ville` ADD COLUMN `structuresRenforcees` INTEGER NOT NULL DEFAULT 0;
