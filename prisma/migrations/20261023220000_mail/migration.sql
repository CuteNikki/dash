-- An invite sent by mail, whose link shows the address is theirs.
-- AlterTable
ALTER TABLE "Invite" ADD COLUMN     "emailed" BOOLEAN NOT NULL DEFAULT false;

