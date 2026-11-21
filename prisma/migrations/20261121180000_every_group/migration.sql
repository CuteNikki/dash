-- Every group, new ones too, rather than only those listed
-- AlterTable
ALTER TABLE "user" ADD COLUMN "everyGroup" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Invite" ADD COLUMN "everyGroup" BOOLEAN NOT NULL DEFAULT false;
