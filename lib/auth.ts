import 'server-only';

import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';

import { db } from '@/lib/db';
import { isCreatingAccount } from '@/lib/setup';

/** Where the dashboard runs. Passkeys only work on this address. */
const authURL = new URL(process.env.BETTER_AUTH_URL ?? 'http://localhost:3000');

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: 'postgresql' }),
  emailAndPassword: { enabled: true },
  plugins: [
    passkey({ rpID: authURL.hostname, rpName: 'dash', origin: authURL.origin }),
    nextCookies(),
  ],
  databaseHooks: {
    user: {
      create: {
        // The one account is made on /setup, with the code from the server's
        // log. Signing up any other way, or a second time, is refused.
        before: async (user) => {
          if (!isCreatingAccount() || (await db.user.count()) > 0) {
            throw new APIError('FORBIDDEN', {
              message: 'This dashboard already has its account.',
            });
          }
          return { data: user };
        },
      },
    },
  },
});
