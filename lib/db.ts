import 'server-only';

import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '@/lib/generated/prisma/client';

/** Connections kept open to the shared PostgreSQL server. */
const POOL_SIZE = 3;

// One client for the process; development's hot reloads reuse it
const globalForDb = globalThis as typeof globalThis & { db?: PrismaClient };

export const db = (globalForDb.db ??= new PrismaClient({
  adapter: new PrismaPg({
    connectionString: process.env.DATABASE_URL,
    max: POOL_SIZE,
  }),
}));
