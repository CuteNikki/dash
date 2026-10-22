-- A tile can span more than one column or row
ALTER TABLE "Tile" ADD COLUMN "width" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Tile" ADD COLUMN "height" INTEGER NOT NULL DEFAULT 1;
