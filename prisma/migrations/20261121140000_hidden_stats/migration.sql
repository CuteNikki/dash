-- An app's numbers left off its tile, by their labels' keys
-- AlterTable
ALTER TABLE "Tile" ADD COLUMN "hiddenStats" TEXT[] DEFAULT ARRAY[]::TEXT[];
