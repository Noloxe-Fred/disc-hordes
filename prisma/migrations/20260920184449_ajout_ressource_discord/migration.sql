-- CreateTable
CREATE TABLE `RessourceDiscord` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `guildId` VARCHAR(191) NOT NULL,
    `cle` VARCHAR(191) NOT NULL,
    `type` ENUM('ROLE', 'CATEGORIE', 'SALON') NOT NULL,
    `discordId` VARCHAR(191) NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RessourceDiscord_guildId_cle_key`(`guildId`, `cle`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

