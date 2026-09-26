/*
  Warnings:

  - You are about to drop the column `blessures` on the `Joueur` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `Joueur` DROP COLUMN `blessures`,
    ADD COLUMN `pv` INTEGER NOT NULL DEFAULT 10;
