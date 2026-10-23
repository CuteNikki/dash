import 'server-only';

import { passkey } from '@better-auth/passkey';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { APIError } from 'better-auth/api';
import { nextCookies } from 'better-auth/next-js';
import { admin, twoFactor } from 'better-auth/plugins';
import { createAccessControl } from 'better-auth/plugins/access';
import { defaultStatements } from 'better-auth/plugins/admin/access';

import { MIN_PASSWORD } from '@/lib/auth/password';
import { accountBeingCreated } from '@/lib/auth/setup';
import { db } from '@/lib/db';
import { SERVER_NAME, SITE_URL } from '@/lib/site';

/**
 * Better Auth's own roles, which only its admin endpoints go by. Those are
 * all turned off over HTTP below: people's accounts are managed through
 * dash's actions, which check lib/auth/access.ts and call auth.api. Only the
 * owner holds Better Auth's permissions, should one be called with headers.
 */
const ac = createAccessControl(defaultStatements);
const roles = {
  owner: ac.newRole({
    user: [...defaultStatements.user],
    session: [...defaultStatements.session],
  }),
  admin: ac.newRole({ user: [], session: [] }),
  operator: ac.newRole({ user: [], session: [] }),
  viewer: ac.newRole({ user: [], session: [] }),
};

/** The admin plugin's endpoints, none of which is reachable over HTTP. */
const ADMIN_PATHS = [
  'set-role',
  'get-user',
  'create-user',
  'update-user',
  'list-users',
  'list-user-sessions',
  'unban-user',
  'ban-user',
  'impersonate-user',
  'stop-impersonating',
  'revoke-user-session',
  'revoke-user-sessions',
  'remove-user',
  'set-user-password',
  'has-permission',
].map((path) => `/admin/${path}`);

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: 'postgresql' }),
  emailAndPassword: { enabled: true, minPasswordLength: MIN_PASSWORD },
  user: {
    // There's no mail to confirm a new address with, so it changes at once,
    // for someone signed in as themselves
    changeEmail: { enabled: true, updateEmailWithoutVerification: true },
  },
  // Accounts are made by /setup's and invites' actions, through auth.api,
  // which doesn't go by these; signing up over HTTP isn't a way in at all
  disabledPaths: ['/sign-up/email', ...ADMIN_PATHS],
  plugins: [
    passkey({
      rpID: SITE_URL.hostname,
      rpName: 'dash',
      origin: SITE_URL.origin,
    }),
    admin({ ac, roles, defaultRole: 'viewer', adminRoles: ['owner'] }),
    // The authenticator app names the account after the server
    twoFactor({ issuer: SERVER_NAME ?? 'dash' }),
    nextCookies(),
  ],
  databaseHooks: {
    user: {
      create: {
        // An account is made on /setup, with the code from the server's
        // log, or from an owner's invite, and only with the email given
        // there, and its role. Any other user is refused, should a way to
        // make one get past the above; /setup's only while there's none.
        before: async (user) => {
          const creating = accountBeingCreated();
          if (
            !creating ||
            user.email.toLowerCase() !== creating.email ||
            (creating.first && (await db.user.count()) > 0)
          ) {
            throw new APIError('FORBIDDEN', {
              message: 'An account can only be made from an invite.',
            });
          }
          return { data: { ...user, role: creating.role } };
        },
      },
    },
  },
});
