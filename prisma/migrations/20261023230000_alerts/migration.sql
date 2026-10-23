-- The monitor's alerts, and whether each person is mailed them.
-- AlterTable
ALTER TABLE "user" ADD COLUMN     "alertMail" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "Alert" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "since" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notifiedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "Alert_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Alert_key_resolvedAt_idx" ON "Alert"("key", "resolvedAt");

-- CreateIndex
CREATE INDEX "Alert_since_idx" ON "Alert"("since");

