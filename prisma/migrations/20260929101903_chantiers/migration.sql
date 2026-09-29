-- AlterTable
ALTER TABLE `BatimentVille` ADD COLUMN `paInstalles` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `Ville` ADD COLUMN `messageChantiersId` VARCHAR(191) NULL;
