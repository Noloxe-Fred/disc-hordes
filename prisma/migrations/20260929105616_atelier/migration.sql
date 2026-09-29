-- AlterTable
ALTER TABLE `Joueur` ADD COLUMN `infusionJusqua` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `Ville` ADD COLUMN `structuresDefense` INTEGER NOT NULL DEFAULT 0;
