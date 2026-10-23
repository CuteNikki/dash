import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';

import { SITE_URL } from '@/lib/site';

/**
 * Whether a request that changes something came from the dashboard's own
 * pages. The session cookie is SameSite=Lax, which another *.example.com site
 * counts as the same site, so a script there could otherwise reboot the
 * server with it. Next checks this for server actions, but not for routes;
 * Better Auth checks its own.
 */
function fromOwnPages(request: NextRequest) {
  const origin = request.headers.get('origin');
  // A browser sends where a POST came from; one that doesn't, at least
  // whether that's this site
  if (!origin) return request.headers.get('sec-fetch-site') === 'same-origin';
  return origin === SITE_URL.origin || origin === request.nextUrl.origin;
}

/**
 * Sends anyone without a session cookie to the sign-in page, or answers 401
 * for the API. Only a first pass: pages, routes and actions check the session
 * itself against the database.
 */
export function proxy(request: NextRequest) {
  const api = request.nextUrl.pathname.startsWith('/api/');
  if (
    api &&
    request.method !== 'GET' &&
    request.method !== 'HEAD' &&
    !fromOwnPages(request)
  ) {
    return Response.json(
      { error: 'Only the dashboard itself can do that' },
      { status: 403 }
    );
  }
  if (getSessionCookie(request)) return NextResponse.next();
  if (api) return Response.json({ error: 'Sign in first' }, { status: 401 });
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  // The icons, manifest and robots.txt too, which a browser fetches before
  // signing in. Each is skipped whole, or with what's under it, so /setupx or
  // /api/authors still come through here.
  matcher: [
    '/((?!(?:login|setup|invite|forgot-password|reset-password|api/auth|favicon[.]ico|icon[.]svg|apple-icon[.]png|manifest[.]webmanifest|robots[.]txt)(?:/|$)|_next/).*)',
  ],
};
