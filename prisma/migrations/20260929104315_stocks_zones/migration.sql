-- AlterTable
ALTER TABLE `Groupe` ADD COLUMN `derniereRegenRessources` DATETIME(3) NULL;

-- AlterTable
ALTER TABLE `Zone` ADD COLUMN `stockFini` INTEGER NULL,
    ADD COLUMN `stockNaturel` INTEGER NULL;
