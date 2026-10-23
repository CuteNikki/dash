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
import { mailReady, sendMail } from '@/lib/mail/mail';
import { SERVER_NAME, SITE_URL } from '@/lib/site';

/**
 * Better Auth's own roles, which only its admin endpoints go by. Those are
 * all turned off over HTTP below: people's accounts are managed through
 * the dashboard's actions, which check lib/auth/access.ts and call auth.api. Only the
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

/** How long a link sent by mail works: a password reset's or an address's. */
const LINK_SECONDS = 60 * 60;

export const auth = betterAuth({
  database: prismaAdapter(db, { provider: 'postgresql' }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: MIN_PASSWORD,
    // A forgotten password is reset from a link by mail, once there's mail;
    // the new one signs out everywhere else, as whoever knew the old might be
    sendResetPassword: mailReady()
      ? async ({ user, url }) =>
          sendMail({
            to: user.email,
            subject: 'Reset your password',
            paragraphs: [
              `Hi ${user.name},`,
              'Someone asked to reset the password of your account on the dashboard. If it was you, pick a new one here; the link works for an hour.',
              "If it wasn't, there's nothing to do: your password stays as it is.",
            ],
            action: { label: 'Pick a new password', url },
          })
      : undefined,
    resetPasswordTokenExpiresIn: LINK_SECONDS,
    revokeSessionsOnPasswordReset: true,
  },
  // Once there's mail, an address is confirmed by a link sent to it
  emailVerification: mailReady()
    ? {
        expiresIn: LINK_SECONDS,
        autoSignInAfterVerification: true,
        sendVerificationEmail: async ({ user, url }) =>
          sendMail({
            to: user.email,
            subject: 'Confirm your email address',
            paragraphs: [
              `Hi ${user.name},`,
              "Confirm this is your address, so the dashboard's mail reaches you: a forgotten password, and alerts if you get them. The link works for an hour.",
            ],
            action: { label: 'Confirm my address', url },
          }),
      }
    : undefined,
  user: {
    changeEmail: {
      enabled: true,
      // One that isn't confirmed changes at once, and the new one is sent a
      // link to confirm it, once there's mail; without mail it just changes
      updateEmailWithoutVerification: true,
      // One that's confirmed changes once the old address agrees, then the
      // new one is confirmed in turn
      sendChangeEmailConfirmation: mailReady()
        ? async ({ user, newEmail, url }) =>
            sendMail({
              to: user.email,
              subject: 'Change your email address?',
              paragraphs: [
                `Hi ${user.name},`,
                `Someone signed in as you asked to change your account's address to ${newEmail}. If it was you, agree to it here; the new address is then sent a link to confirm it.`,
                "If it wasn't, don't open the link, and change your password.",
              ],
              action: { label: `Change it to ${newEmail}`, url },
            })
        : undefined,
    },
  },
  // Accounts are made by /setup's and invites' actions, through auth.api,
  // which doesn't go by these; signing up over HTTP isn't a way in at all
  disabledPaths: ['/sign-up/email', ...ADMIN_PATHS],
  plugins: [
    passkey({
      rpID: SITE_URL.hostname,
      rpName: 'Dashboard',
      origin: SITE_URL.origin,
    }),
    admin({ ac, roles, defaultRole: 'viewer', adminRoles: ['owner'] }),
    // The authenticator app names the account after the server
    twoFactor({ issuer: SERVER_NAME ?? 'Dashboard' }),
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
