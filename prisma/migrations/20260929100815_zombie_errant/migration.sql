-- AlterTable
ALTER TABLE `Joueur` MODIFY `causeMort` ENUM('ATTAQUE_NOCTURNE', 'COMBAT_EXTERIEUR', 'FAIM', 'SOIF', 'INFECTION', 'EAU_CONTAMINEE', 'ZOMBIE_ERRANT') NULL;

-- CreateTable
CREATE TABLE `ZombieErrant` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `transformeId` INTEGER NOT NULL,
    `villeId` INTEGER NOT NULL,
    `zoneId` INTEGER NULL,
    `pv` INTEGER NOT NULL,
    `pvMax` INTEGER NOT NULL,
    `cibleId` INTEGER NULL,

    UNIQUE INDEX `ZombieErrant_transformeId_key`(`transformeId`),
    UNIQUE INDEX `ZombieErrant_cibleId_key`(`cibleId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `ZombieErrant` ADD CONSTRAINT `ZombieErrant_transformeId_fkey` FOREIGN KEY (`transformeId`) REFERENCES `Joueur`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ZombieErrant` ADD CONSTRAINT `ZombieErrant_cibleId_fkey` FOREIGN KEY (`cibleId`) REFERENCES `Joueur`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ZombieErrant` ADD CONSTRAINT `ZombieErrant_villeId_fkey` FOREIGN KEY (`villeId`) REFERENCES `Ville`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ZombieErrant` ADD CONSTRAINT `ZombieErrant_zoneId_fkey` FOREIGN KEY (`zoneId`) REFERENCES `Zone`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
