import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // A server with just what it needs, for the dashboard's own container
  output: 'standalone',
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
