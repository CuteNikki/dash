-- Where tiles sit at each number of columns, once arranged there
CREATE TABLE "TileLayout" (
    "key" TEXT NOT NULL,
    "columns" INTEGER NOT NULL,
    "x" INTEGER NOT NULL,
    "y" INTEGER NOT NULL,
    "w" INTEGER NOT NULL,
    "h" INTEGER NOT NULL,

    CONSTRAINT "TileLayout_pkey" PRIMARY KEY ("key","columns")
);

