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
import { relay } from '@/lib/apps/relay';

/** The apps dash can read, by their image's name, "lscr.io/linuxserver/sonarr" → sonarr, or by a dash.app label. */
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
  // Labelled dash.app: relay in its compose file, its image being named for its folder
  relay,
};
