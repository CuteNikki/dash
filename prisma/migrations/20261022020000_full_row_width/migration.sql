-- Tiles 4 wide filled the row when the grid had 4 columns at most; it now
-- has up to 8, so they keep filling it
UPDATE "Tile" SET "width" = 8 WHERE "width" = 4;
UPDATE "HostTile" SET "width" = 8 WHERE "width" = 4;
