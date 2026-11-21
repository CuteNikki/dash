-- Whether a service's updates are left out: no badge, nor a row under Updates
-- AlterTable
ALTER TABLE "Tile" ADD COLUMN "ignoreUpdates" BOOLEAN NOT NULL DEFAULT false;
