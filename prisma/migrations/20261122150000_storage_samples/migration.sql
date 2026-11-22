-- What each service kept on the disk, once a day
-- CreateTable
CREATE TABLE "StorageSample" (
    "key" TEXT NOT NULL,
    "day" TIMESTAMP(3) NOT NULL,
    "bytes" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "StorageSample_pkey" PRIMARY KEY ("key","day")
);

-- CreateIndex
CREATE INDEX "StorageSample_day_idx" ON "StorageSample"("day");
