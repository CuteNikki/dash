-- The monitor's readings: the server's and each service's, one a minute, and
-- each website's checks, kept for a while to look back on.
-- CreateTable
CREATE TABLE "HostSample" (
    "at" TIMESTAMP(3) NOT NULL,
    "cpu" DOUBLE PRECISION NOT NULL,
    "memory" DOUBLE PRECISION NOT NULL,
    "diskUsed" DOUBLE PRECISION NOT NULL,
    "received" DOUBLE PRECISION NOT NULL,
    "sent" DOUBLE PRECISION NOT NULL,
    "diskRead" DOUBLE PRECISION NOT NULL,
    "diskWritten" DOUBLE PRECISION NOT NULL,
    "diskWait" DOUBLE PRECISION NOT NULL,
    "load" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "HostSample_pkey" PRIMARY KEY ("at")
);

-- CreateTable
CREATE TABLE "ContainerSample" (
    "key" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "cpu" DOUBLE PRECISION NOT NULL,
    "memory" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "ContainerSample_pkey" PRIMARY KEY ("key","at")
);

-- CreateTable
CREATE TABLE "SiteCheckLog" (
    "key" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "ms" DOUBLE PRECISION NOT NULL,
    "status" INTEGER,
    "error" TEXT,

    CONSTRAINT "SiteCheckLog_pkey" PRIMARY KEY ("key","at")
);

-- CreateIndex
CREATE INDEX "ContainerSample_at_idx" ON "ContainerSample"("at");

-- CreateIndex
CREATE INDEX "SiteCheckLog_at_idx" ON "SiteCheckLog"("at");

