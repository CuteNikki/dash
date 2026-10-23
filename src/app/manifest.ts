import type { MetadataRoute } from 'next';

/** dash as an app of its own, added to a phone's home screen or installed from the browser. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'dash',
    short_name: 'dash',
    description: 'Services, containers and files on the VPS',
    start_url: '/',
    display: 'standalone',
    // The dark tile the icon is drawn on, while it opens
    background_color: '#18181b',
    theme_color: '#18181b',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml' },
      { src: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  };
}
