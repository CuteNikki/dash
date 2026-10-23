import type { MetadataRoute } from 'next';

/** Nothing here for a search engine: it's all behind a sign-in. */
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: '*', disallow: '/' } };
}
