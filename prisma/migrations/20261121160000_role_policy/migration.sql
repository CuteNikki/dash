-- What's asked of each role's accounts: a second factor, for one
-- CreateTable
CREATE TABLE "RolePolicy" (
    "role" TEXT NOT NULL,
    "requireTwoFactor" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RolePolicy_pkey" PRIMARY KEY ("role")
);
