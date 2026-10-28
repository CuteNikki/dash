import type { NextConfig } from 'next';

/**
 * Every answer's: never in a frame, as another site of the same domain could
 * otherwise put it in one and have its buttons clicked through; nothing
 * guessing a file's type; and where a link was followed from kept to the
 * dashboard. Scripts aren't held to a list: React's pages, styles and the
 * theme's own inline script would need a nonce, rendering every page anew.
 */
const SECURITY_HEADERS = [
  {
    key: 'Content-Security-Policy',
    value:
      "frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'",
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'same-origin' },
  // Only ever over HTTPS, once it's been reached over it; plain HTTP ignores it
  { key: 'Strict-Transport-Security', value: 'max-age=31536000' },
  {
    key: 'Permissions-Policy',
    value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  },
];

const nextConfig: NextConfig = {
  // A server with just what it needs, for the dashboard's own container
  output: 'standalone',
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: SECURITY_HEADERS }];
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
