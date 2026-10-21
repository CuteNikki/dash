-- A tile's one link becomes a list of addresses, keeping each link it had
ALTER TABLE "Tile" ADD COLUMN "addresses" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "Tile" SET "addresses" = ARRAY["url"] WHERE "url" IS NOT NULL AND "url" <> '';
ALTER TABLE "Tile" DROP COLUMN "url";
