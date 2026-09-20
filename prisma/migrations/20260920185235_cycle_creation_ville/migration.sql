-- DropForeignKey
ALTER TABLE `Ville` DROP FOREIGN KEY `Ville_groupeId_fkey`;

-- AlterTable
ALTER TABLE `Ville` ADD COLUMN `createurUtilisateurId` INTEGER NOT NULL,
    ADD COLUMN `messageAnnonceId` VARCHAR(191) NULL,
    MODIFY `groupeId` INTEGER NULL;

-- CreateTable
CREATE TABLE `DemandeInscription` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `villeId` INTEGER NOT NULL,
    `utilisateurId` INTEGER NOT NULL,
    `metierDemande` ENUM('GARDE', 'MEDECIN', 'ARTISAN', 'ECLAIREUR', 'GUETTEUR', 'CUISINIER', 'FOSSOYEUR', 'INGENIEUR', 'CHASSEUR', 'DIPLOMATE') NULL,
    `statut` ENUM('EN_ATTENTE', 'ACCEPTEE', 'REFUSEE', 'ANNULEE') NOT NULL DEFAULT 'EN_ATTENTE',
    `messageId` VARCHAR(191) NULL,
    `dateCreation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dateReponse` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Ville` ADD CONSTRAINT `Ville_createurUtilisateurId_fkey` FOREIGN KEY (`createurUtilisateurId`) REFERENCES `Utilisateur`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ville` ADD CONSTRAINT `Ville_groupeId_fkey` FOREIGN KEY (`groupeId`) REFERENCES `Groupe`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DemandeInscription` ADD CONSTRAINT `DemandeInscription_villeId_fkey` FOREIGN KEY (`villeId`) REFERENCES `Ville`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DemandeInscription` ADD CONSTRAINT `DemandeInscription_utilisateurId_fkey` FOREIGN KEY (`utilisateurId`) REFERENCES `Utilisateur`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

