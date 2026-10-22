import { getSessionCookie } from 'better-auth/cookies';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Sends anyone without a session cookie to the sign-in page, or answers 401
 * for the API. Only a first pass: pages, routes and actions check the session
 * itself against the database.
 */
export function proxy(request: NextRequest) {
  if (getSessionCookie(request)) return NextResponse.next();
  if (request.nextUrl.pathname.startsWith('/api/')) {
    return Response.json({ error: 'Sign in first' }, { status: 401 });
  }
  return NextResponse.redirect(new URL('/login', request.url));
}

export const config = {
  // The icons, manifest and robots.txt too, which a browser fetches before signing in
  matcher: [
    '/((?!login|setup|api/auth|_next/|favicon.ico|icon.svg|apple-icon.png|manifest.webmanifest|robots.txt).*)',
  ],
};
