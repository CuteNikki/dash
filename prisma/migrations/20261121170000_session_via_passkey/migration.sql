-- A session signed in with a passkey, two factors itself
-- AlterTable
ALTER TABLE "session" ADD COLUMN "viaPasskey" BOOLEAN NOT NULL DEFAULT false;
