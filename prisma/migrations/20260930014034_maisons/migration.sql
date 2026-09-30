-- AlterTable
ALTER TABLE `Joueur` ADD COLUMN `maisonPaInstalles` INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE `Ville` ADD COLUMN `messageMaisonsId` VARCHAR(191) NULL;

-- CreateTable
CREATE TABLE `ContributionMaison` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `joueurId` INTEGER NOT NULL,
    `objetId` INTEGER NOT NULL,
    `quantiteDeposee` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `ContributionMaison_joueurId_objetId_key`(`joueurId`, `objetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ContributionMaison` ADD CONSTRAINT `ContributionMaison_joueurId_fkey` FOREIGN KEY (`joueurId`) REFERENCES `Joueur`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContributionMaison` ADD CONSTRAINT `ContributionMaison_objetId_fkey` FOREIGN KEY (`objetId`) REFERENCES `Objet`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
