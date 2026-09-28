-- AlterTable
ALTER TABLE `Joueur` MODIFY `maisonPalier` INTEGER NOT NULL DEFAULT 0;

-- Aucune maison n'a pu etre construite jusqu'ici : les joueurs au palier 1 par defaut n'en ont en realite pas
UPDATE `Joueur` SET `maisonPalier` = 0 WHERE `maisonPalier` = 1;
