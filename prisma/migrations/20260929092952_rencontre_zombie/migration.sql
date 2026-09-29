-- AlterTable
ALTER TABLE `Joueur` ADD COLUMN `rencontrePvZombie` INTEGER NULL,
    ADD COLUMN `rencontreRetourVille` BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN `rencontreRetourZoneId` INTEGER NULL;
