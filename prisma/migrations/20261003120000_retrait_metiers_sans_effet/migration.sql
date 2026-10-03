-- Retrait des metiers sans effet en jeu (Guetteur, Fossoyeur, Diplomate/marchand) : leurs porteurs passent sans metier
UPDATE `Joueur` SET `metier` = NULL WHERE `metier` IN ('GUETTEUR', 'FOSSOYEUR', 'DIPLOMATE');
UPDATE `DemandeInscription` SET `metierDemande` = NULL WHERE `metierDemande` IN ('GUETTEUR', 'FOSSOYEUR', 'DIPLOMATE');
UPDATE `Recette` SET `metierExclusif` = NULL WHERE `metierExclusif` IN ('GUETTEUR', 'FOSSOYEUR', 'DIPLOMATE');

-- AlterTable
ALTER TABLE `Joueur` MODIFY `metier` ENUM('GARDE', 'MEDECIN', 'ARTISAN', 'ECLAIREUR', 'CUISINIER', 'INGENIEUR', 'CHASSEUR') NULL;

-- AlterTable
ALTER TABLE `DemandeInscription` MODIFY `metierDemande` ENUM('GARDE', 'MEDECIN', 'ARTISAN', 'ECLAIREUR', 'CUISINIER', 'INGENIEUR', 'CHASSEUR') NULL;

-- AlterTable
ALTER TABLE `Recette` MODIFY `metierExclusif` ENUM('GARDE', 'MEDECIN', 'ARTISAN', 'ECLAIREUR', 'CUISINIER', 'INGENIEUR', 'CHASSEUR') NULL;
