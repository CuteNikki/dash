-- Each service's network and disk, a minute at a time; none in readings from before
-- AlterTable
ALTER TABLE "ContainerSample" ADD COLUMN     "diskRead" DOUBLE PRECISION,
ADD COLUMN     "diskWritten" DOUBLE PRECISION,
ADD COLUMN     "received" DOUBLE PRECISION,
ADD COLUMN     "sent" DOUBLE PRECISION;
