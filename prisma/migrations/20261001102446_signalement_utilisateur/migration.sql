-- DropForeignKey
ALTER TABLE `Signalement` DROP FOREIGN KEY `Signalement_cibleId_fkey`;

-- DropForeignKey
ALTER TABLE `Signalement` DROP FOREIGN KEY `Signalement_signalantId_fkey`;

-- DropIndex
DROP INDEX `Signalement_cibleId_fkey` ON `Signalement`;

-- DropIndex
DROP INDEX `Signalement_signalantId_fkey` ON `Signalement`;

-- Les identifiants designaient des Joueur, ils designent desormais des Utilisateur : anciens signalements effaces
DELETE FROM `Signalement`;

-- AlterTable
ALTER TABLE `Signalement` ADD COLUMN `messageId` VARCHAR(191) NULL,
    ADD COLUMN `salonId` VARCHAR(191) NULL,
    ADD COLUMN `traiteParDiscordId` VARCHAR(191) NULL,
    MODIFY `message` TEXT NOT NULL;

-- AddForeignKey
ALTER TABLE `Signalement` ADD CONSTRAINT `Signalement_signalantId_fkey` FOREIGN KEY (`signalantId`) REFERENCES `Utilisateur`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Signalement` ADD CONSTRAINT `Signalement_cibleId_fkey` FOREIGN KEY (`cibleId`) REFERENCES `Utilisateur`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
