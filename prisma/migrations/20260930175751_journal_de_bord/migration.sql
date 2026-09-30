-- AlterTable
ALTER TABLE `JournalEntree` ADD COLUMN `publiee` BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX `JournalEntree_public_publiee_idx` ON `JournalEntree`(`public`, `publiee`);

-- Entrees anterieures au salon #journal : considerees comme deja publiees (pas de rattrapage massif au demarrage)
UPDATE `JournalEntree` SET `publiee` = true;
