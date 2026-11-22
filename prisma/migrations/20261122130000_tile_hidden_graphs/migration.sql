-- A tile's graphs left off it
-- AlterTable
ALTER TABLE "Tile" ADD COLUMN     "hiddenGraphs" TEXT[] DEFAULT ARRAY[]::TEXT[];
