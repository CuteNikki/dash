-- An alert's message, and its subject where it has one of its own, as keys
-- and values, for each reader's language
-- AlterTable
ALTER TABLE "Alert" ADD COLUMN "words" JSONB;
