/** The server dash is the dashboard of, as its heading and tab title name it. */
export const SERVER_NAME = 'vps.niso.moe';

/**
 * dash's own compose project, whose update restarts it: updated last, so
 * nothing after it waits on a dash that's starting again.
 */
export const DASH_PROJECT = 'dash';

/**
 * Where the dashboard is reached, as BETTER_AUTH_URL names it: passkeys only
 * work on this address, and the icons and manifest are linked from it.
 * Where it isn't set, as while the image is built, it's the server's own.
 */
export const SITE_URL = new URL(
  process.env.BETTER_AUTH_URL ?? 'https://dash.niso.moe'
);
