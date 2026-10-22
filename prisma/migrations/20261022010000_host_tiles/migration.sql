-- Where the server's tiles go, and their sizes, once they've been arranged
CREATE TABLE "HostTile" (
    "key" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,

    CONSTRAINT "HostTile_pkey" PRIMARY KEY ("key")
);
