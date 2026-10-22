import 'server-only';

import type { App } from '@/lib/apps/app';
import { radarr, sonarr } from '@/lib/apps/arr';
import { caddy } from '@/lib/apps/caddy';
import { garage } from '@/lib/apps/garage';
import { jellyfin } from '@/lib/apps/jellyfin';
import { minecraft } from '@/lib/apps/minecraft';
import { postgres } from '@/lib/apps/postgres';
import { prowlarr } from '@/lib/apps/prowlarr';
import { qbittorrent } from '@/lib/apps/qbittorrent';

/** The apps dash can read, by their image's name: "lscr.io/linuxserver/sonarr" → sonarr. */
export const APPS: Record<string, App> = {
  sonarr,
  radarr,
  prowlarr,
  jellyfin,
  qbittorrent,
  'minecraft-server': minecraft,
  postgres,
  garage,
  caddy,
};
