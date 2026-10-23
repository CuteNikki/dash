/**
 * The server this dashboard is for, as its heading and tab title name it:
 * its host name, as vps.example.com. Read when the image is built, as the
 * browser shows it too; without one, they say "Dashboard" alone.
 */
export const SERVER_NAME = process.env.NEXT_PUBLIC_SERVER_NAME || undefined;

/**
 * The dashboard's own compose project, whose update restarts it: updated last, so
 * nothing after it waits on a dashboard that's starting again.
 */
export const DASH_PROJECT = 'dash';

/**
 * Where the dashboard is reached, as BETTER_AUTH_URL names it, read when it
 * starts: passkeys only work on this address, and only its own pages may
 * change things through the API.
 */
export const SITE_URL = new URL(
  process.env.BETTER_AUTH_URL ?? 'http://localhost:3000'
);
