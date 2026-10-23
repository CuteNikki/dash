import 'server-only';

import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';

import { accountBeingCreated } from '@/lib/auth/setup';
import { db } from '@/lib/db';
import { SITE_URL } from '@/lib/site';

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: 'postgresql' }),
  emailAndPassword: { enabled: true },
  // The one account is made by /setup's action, through auth.api, which
  // doesn't go by these; signing up over HTTP isn't a way in at all
  disabledPaths: ['/sign-up/email'],
  plugins: [
    passkey({
      rpID: SITE_URL.hostname,
      rpName: 'dash',
      origin: SITE_URL.origin,
    }),
    nextCookies(),
  ],
  databaseHooks: {
    user: {
      create: {
        // The one account is made on /setup, with the code from the server's
        // log, and only with the email given there. Any other user, or a
        // second, is refused, should a way to make one get past the above.
        before: async (user) => {
          const email = accountBeingCreated();
          if (
            !email ||
            user.email.toLowerCase() !== email ||
            (await db.user.count()) > 0
          ) {
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
