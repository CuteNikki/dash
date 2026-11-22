-- A server tile hidden, or showing a view of its own; changed without being moved
-- AlterTable
ALTER TABLE "HostTile" ADD COLUMN     "hidden" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "view" TEXT,
ALTER COLUMN "position" DROP NOT NULL,
ALTER COLUMN "width" DROP NOT NULL,
ALTER COLUMN "height" DROP NOT NULL;
