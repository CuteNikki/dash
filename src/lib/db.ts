import 'server-only';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '@/lib/generated/prisma/client';

/** Connections kept open to the shared PostgreSQL server. */
const POOL_SIZE = 3;

// One client for the process; development's hot reloads reuse it, unless
// prisma generate has since made a new client that knows a changed schema
const globalForDb = globalThis as typeof globalThis & {
  prisma?: { client: PrismaClient; of: typeof PrismaClient };
};

if (globalForDb.prisma?.of !== PrismaClient) {
  void globalForDb.prisma?.client.$disconnect();
  globalForDb.prisma = {
    client: new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
        max: POOL_SIZE,
      }),
    }),
    of: PrismaClient,
  };
}

export const db = globalForDb.prisma.client;
