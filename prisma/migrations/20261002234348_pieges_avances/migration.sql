-- CreateTable
CREATE TABLE `Piege` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `zoneId` INTEGER NOT NULL,
    `poseurId` INTEGER NULL,
    `poseLe` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `priseLe` DATETIME(3) NULL,

    UNIQUE INDEX `Piege_zoneId_key`(`zoneId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PiegeConnu` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `piegeId` INTEGER NOT NULL,
    `joueurId` INTEGER NOT NULL,

    UNIQUE INDEX `PiegeConnu_piegeId_joueurId_key`(`piegeId`, `joueurId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Piege` ADD CONSTRAINT `Piege_zoneId_fkey` FOREIGN KEY (`zoneId`) REFERENCES `Zone`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Piege` ADD CONSTRAINT `Piege_poseurId_fkey` FOREIGN KEY (`poseurId`) REFERENCES `Joueur`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PiegeConnu` ADD CONSTRAINT `PiegeConnu_piegeId_fkey` FOREIGN KEY (`piegeId`) REFERENCES `Piege`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PiegeConnu` ADD CONSTRAINT `PiegeConnu_joueurId_fkey` FOREIGN KEY (`joueurId`) REFERENCES `Joueur`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
