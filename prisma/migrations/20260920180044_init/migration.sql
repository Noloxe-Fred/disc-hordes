-- CreateTable
CREATE TABLE `Utilisateur` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `discordId` VARCHAR(191) NOT NULL,
    `pseudoCache` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Utilisateur_discordId_key`(`discordId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Succes` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(191) NOT NULL,
    `nom` VARCHAR(191) NOT NULL,
    `description` VARCHAR(191) NOT NULL,

    UNIQUE INDEX `Succes_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `UtilisateurSucces` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `utilisateurId` INTEGER NOT NULL,
    `succesId` INTEGER NOT NULL,
    `obtenuLe` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `UtilisateurSucces_utilisateurId_succesId_key`(`utilisateurId`, `succesId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Groupe` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Ville` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nom` VARCHAR(191) NOT NULL,
    `groupeId` INTEGER NOT NULL,
    `statut` ENUM('EN_CREATION', 'ACTIVE', 'TOMBEE') NOT NULL DEFAULT 'EN_CREATION',
    `dateCreation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dateFondation` DATETIME(3) NULL,
    `dateChute` DATETIME(3) NULL,
    `paMaxFondation` INTEGER NULL,
    `cycleActuel` INTEGER NOT NULL DEFAULT 0,
    `phaseActuelle` ENUM('JOUR', 'NUIT') NOT NULL DEFAULT 'JOUR',
    `meteoActuelle` ENUM('NORMALE', 'MAUVAIS_TEMPS') NOT NULL DEFAULT 'NORMALE',
    `rationnementActif` BOOLEAN NOT NULL DEFAULT false,
    `maireId` INTEGER NULL,
    `mandatFinCycle` INTEGER NULL,

    UNIQUE INDEX `Ville_maireId_key`(`maireId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Zone` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nom` VARCHAR(191) NOT NULL,
    `palier` ENUM('PROCHE', 'MOYENNE', 'ELOIGNEE') NOT NULL,
    `groupeId` INTEGER NOT NULL,

    UNIQUE INDEX `Zone_groupeId_nom_key`(`groupeId`, `nom`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ZoneAdjacence` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `zoneAId` INTEGER NOT NULL,
    `zoneBId` INTEGER NOT NULL,

    UNIQUE INDEX `ZoneAdjacence_zoneAId_zoneBId_key`(`zoneAId`, `zoneBId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CarteDecouverte` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `joueurId` INTEGER NOT NULL,
    `zoneId` INTEGER NOT NULL,
    `decouvertLe` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `CarteDecouverte_joueurId_zoneId_key`(`joueurId`, `zoneId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ZoneRessourceStock` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `zoneId` INTEGER NOT NULL,
    `objetId` INTEGER NOT NULL,
    `quantiteActuelle` INTEGER NOT NULL,
    `quantiteMax` INTEGER NOT NULL,

    UNIQUE INDEX `ZoneRessourceStock_zoneId_objetId_key`(`zoneId`, `objetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Objet` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nom` VARCHAR(191) NOT NULL,
    `type` ENUM('RESSOURCE_BRUTE', 'CRAFT_SIMPLE', 'CRAFT_AVANCE', 'RARE') NOT NULL,
    `regenerant` BOOLEAN NOT NULL DEFAULT false,

    UNIQUE INDEX `Objet_nom_key`(`nom`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Recette` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `objetResultatId` INTEGER NOT NULL,
    `coutPA` INTEGER NULL,
    `requiertAtelier` BOOLEAN NOT NULL DEFAULT false,
    `palierAtelierRequis` INTEGER NULL,
    `metierExclusif` ENUM('GARDE', 'MEDECIN', 'ARTISAN', 'ECLAIREUR', 'GUETTEUR', 'CUISINIER', 'FOSSOYEUR', 'INGENIEUR', 'CHASSEUR', 'DIPLOMATE') NULL,

    UNIQUE INDEX `Recette_objetResultatId_key`(`objetResultatId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RecetteIngredient` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `recetteId` INTEGER NOT NULL,
    `objetId` INTEGER NOT NULL,
    `quantite` INTEGER NOT NULL,

    UNIQUE INDEX `RecetteIngredient_recetteId_objetId_key`(`recetteId`, `objetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InventaireJoueur` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `joueurId` INTEGER NOT NULL,
    `objetId` INTEGER NOT NULL,
    `quantite` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `InventaireJoueur_joueurId_objetId_key`(`joueurId`, `objetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `InventaireVille` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `villeId` INTEGER NOT NULL,
    `objetId` INTEGER NOT NULL,
    `quantite` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `InventaireVille_villeId_objetId_key`(`villeId`, `objetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BatimentVille` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `villeId` INTEGER NOT NULL,
    `type` ENUM('PALISSADE', 'ATELIER', 'PUITS', 'PLACE_PUBLIQUE', 'MAIRIE') NOT NULL,
    `palierActuel` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `BatimentVille_villeId_type_key`(`villeId`, `type`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ContributionBatiment` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `batimentVilleId` INTEGER NOT NULL,
    `objetId` INTEGER NOT NULL,
    `quantiteDeposee` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `ContributionBatiment_batimentVilleId_objetId_key`(`batimentVilleId`, `objetId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Joueur` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `utilisateurId` INTEGER NOT NULL,
    `villeId` INTEGER NULL,
    `zoneActuelleId` INTEGER NULL,
    `metier` ENUM('GARDE', 'MEDECIN', 'ARTISAN', 'ECLAIREUR', 'GUETTEUR', 'CUISINIER', 'FOSSOYEUR', 'INGENIEUR', 'CHASSEUR', 'DIPLOMATE') NULL,
    `statut` ENUM('VIVANT', 'MORT', 'ZOMBIFIE', 'EXCLU') NOT NULL DEFAULT 'VIVANT',
    `paMax` INTEGER NULL,
    `paActuel` INTEGER NULL,
    `faim` INTEGER NOT NULL DEFAULT 100,
    `soif` INTEGER NOT NULL DEFAULT 100,
    `blessures` INTEGER NOT NULL DEFAULT 0,
    `infecteDepuis` DATETIME(3) NULL,
    `maisonPalier` INTEGER NOT NULL DEFAULT 1,
    `xp` INTEGER NOT NULL DEFAULT 0,
    `dateArrivee` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dateSortie` DATETIME(3) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `CycleAttaque` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `villeId` INTEGER NOT NULL,
    `cycleNumero` INTEGER NOT NULL,
    `forceAttaque` DOUBLE NOT NULL,
    `defenseTotale` DOUBLE NOT NULL,
    `meteoMauvais` BOOLEAN NOT NULL DEFAULT false,
    `dateResolution` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `CycleAttaque_villeId_cycleNumero_key`(`villeId`, `cycleNumero`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `GardeVolontaire` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `cycleAttaqueId` INTEGER NOT NULL,
    `joueurId` INTEGER NOT NULL,
    `bonus` INTEGER NOT NULL,

    UNIQUE INDEX `GardeVolontaire_cycleAttaqueId_joueurId_key`(`cycleAttaqueId`, `joueurId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Election` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `villeId` INTEGER NOT NULL,
    `type` ENUM('MAIRE', 'DEFIANCE') NOT NULL,
    `dateDeclenchement` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `dateVote` DATETIME(3) NOT NULL,
    `statut` ENUM('EN_COURS', 'TERMINEE') NOT NULL DEFAULT 'EN_COURS',
    `maireCibleId` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Candidature` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `electionId` INTEGER NOT NULL,
    `joueurId` INTEGER NOT NULL,
    `votes` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `Candidature_electionId_joueurId_key`(`electionId`, `joueurId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Vote` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `electionId` INTEGER NOT NULL,
    `votantId` INTEGER NOT NULL,
    `candidatId` INTEGER NULL,
    `choixDestitution` BOOLEAN NULL,
    `dateVote` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `Vote_electionId_votantId_key`(`electionId`, `votantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Signalement` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `signalantId` INTEGER NOT NULL,
    `cibleId` INTEGER NULL,
    `message` VARCHAR(191) NOT NULL,
    `dateCreation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `traite` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `JournalEntree` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `villeId` INTEGER NOT NULL,
    `joueurId` INTEGER NULL,
    `message` VARCHAR(191) NOT NULL,
    `public` BOOLEAN NOT NULL DEFAULT true,
    `dateCreation` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `UtilisateurSucces` ADD CONSTRAINT `UtilisateurSucces_utilisateurId_fkey` FOREIGN KEY (`utilisateurId`) REFERENCES `Utilisateur`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `UtilisateurSucces` ADD CONSTRAINT `UtilisateurSucces_succesId_fkey` FOREIGN KEY (`succesId`) REFERENCES `Succes`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ville` ADD CONSTRAINT `Ville_groupeId_fkey` FOREIGN KEY (`groupeId`) REFERENCES `Groupe`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Ville` ADD CONSTRAINT `Ville_maireId_fkey` FOREIGN KEY (`maireId`) REFERENCES `Joueur`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Zone` ADD CONSTRAINT `Zone_groupeId_fkey` FOREIGN KEY (`groupeId`) REFERENCES `Groupe`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ZoneAdjacence` ADD CONSTRAINT `ZoneAdjacence_zoneAId_fkey` FOREIGN KEY (`zoneAId`) REFERENCES `Zone`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ZoneAdjacence` ADD CONSTRAINT `ZoneAdjacence_zoneBId_fkey` FOREIGN KEY (`zoneBId`) REFERENCES `Zone`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CarteDecouverte` ADD CONSTRAINT `CarteDecouverte_joueurId_fkey` FOREIGN KEY (`joueurId`) REFERENCES `Joueur`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CarteDecouverte` ADD CONSTRAINT `CarteDecouverte_zoneId_fkey` FOREIGN KEY (`zoneId`) REFERENCES `Zone`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ZoneRessourceStock` ADD CONSTRAINT `ZoneRessourceStock_zoneId_fkey` FOREIGN KEY (`zoneId`) REFERENCES `Zone`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ZoneRessourceStock` ADD CONSTRAINT `ZoneRessourceStock_objetId_fkey` FOREIGN KEY (`objetId`) REFERENCES `Objet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Recette` ADD CONSTRAINT `Recette_objetResultatId_fkey` FOREIGN KEY (`objetResultatId`) REFERENCES `Objet`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecetteIngredient` ADD CONSTRAINT `RecetteIngredient_recetteId_fkey` FOREIGN KEY (`recetteId`) REFERENCES `Recette`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RecetteIngredient` ADD CONSTRAINT `RecetteIngredient_objetId_fkey` FOREIGN KEY (`objetId`) REFERENCES `Objet`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventaireJoueur` ADD CONSTRAINT `InventaireJoueur_joueurId_fkey` FOREIGN KEY (`joueurId`) REFERENCES `Joueur`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventaireJoueur` ADD CONSTRAINT `InventaireJoueur_objetId_fkey` FOREIGN KEY (`objetId`) REFERENCES `Objet`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventaireVille` ADD CONSTRAINT `InventaireVille_villeId_fkey` FOREIGN KEY (`villeId`) REFERENCES `Ville`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `InventaireVille` ADD CONSTRAINT `InventaireVille_objetId_fkey` FOREIGN KEY (`objetId`) REFERENCES `Objet`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `BatimentVille` ADD CONSTRAINT `BatimentVille_villeId_fkey` FOREIGN KEY (`villeId`) REFERENCES `Ville`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContributionBatiment` ADD CONSTRAINT `ContributionBatiment_batimentVilleId_fkey` FOREIGN KEY (`batimentVilleId`) REFERENCES `BatimentVille`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `ContributionBatiment` ADD CONSTRAINT `ContributionBatiment_objetId_fkey` FOREIGN KEY (`objetId`) REFERENCES `Objet`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Joueur` ADD CONSTRAINT `Joueur_utilisateurId_fkey` FOREIGN KEY (`utilisateurId`) REFERENCES `Utilisateur`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Joueur` ADD CONSTRAINT `Joueur_villeId_fkey` FOREIGN KEY (`villeId`) REFERENCES `Ville`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Joueur` ADD CONSTRAINT `Joueur_zoneActuelleId_fkey` FOREIGN KEY (`zoneActuelleId`) REFERENCES `Zone`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `CycleAttaque` ADD CONSTRAINT `CycleAttaque_villeId_fkey` FOREIGN KEY (`villeId`) REFERENCES `Ville`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GardeVolontaire` ADD CONSTRAINT `GardeVolontaire_cycleAttaqueId_fkey` FOREIGN KEY (`cycleAttaqueId`) REFERENCES `CycleAttaque`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `GardeVolontaire` ADD CONSTRAINT `GardeVolontaire_joueurId_fkey` FOREIGN KEY (`joueurId`) REFERENCES `Joueur`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Election` ADD CONSTRAINT `Election_villeId_fkey` FOREIGN KEY (`villeId`) REFERENCES `Ville`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Candidature` ADD CONSTRAINT `Candidature_electionId_fkey` FOREIGN KEY (`electionId`) REFERENCES `Election`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Candidature` ADD CONSTRAINT `Candidature_joueurId_fkey` FOREIGN KEY (`joueurId`) REFERENCES `Joueur`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Vote` ADD CONSTRAINT `Vote_electionId_fkey` FOREIGN KEY (`electionId`) REFERENCES `Election`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Vote` ADD CONSTRAINT `Vote_votantId_fkey` FOREIGN KEY (`votantId`) REFERENCES `Joueur`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Signalement` ADD CONSTRAINT `Signalement_signalantId_fkey` FOREIGN KEY (`signalantId`) REFERENCES `Joueur`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Signalement` ADD CONSTRAINT `Signalement_cibleId_fkey` FOREIGN KEY (`cibleId`) REFERENCES `Joueur`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JournalEntree` ADD CONSTRAINT `JournalEntree_villeId_fkey` FOREIGN KEY (`villeId`) REFERENCES `Ville`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `JournalEntree` ADD CONSTRAINT `JournalEntree_joueurId_fkey` FOREIGN KEY (`joueurId`) REFERENCES `Joueur`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

