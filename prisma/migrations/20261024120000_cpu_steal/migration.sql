-- The CPU time the provider gave to other machines on the same host, per
-- reading; null in those from before it was kept, rather than a 0 that wasn't
-- measured.
-- AlterTable
ALTER TABLE "HostSample" ADD COLUMN "steal" DOUBLE PRECISION;
