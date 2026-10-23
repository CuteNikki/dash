import 'server-only';

import type { App } from '@/lib/apps/app';
import { radarr, sonarr } from '@/lib/apps/arr';
import { caddy } from '@/lib/apps/caddy';
import { flaresolverr } from '@/lib/apps/flaresolverr';
import { garage } from '@/lib/apps/garage';
import { gluetun } from '@/lib/apps/gluetun';
import { jellyfin } from '@/lib/apps/jellyfin';
import { ludo } from '@/lib/apps/ludo';
import { minecraft } from '@/lib/apps/minecraft';
import { postgres } from '@/lib/apps/postgres';
import { prowlarr } from '@/lib/apps/prowlarr';
import { qbittorrent } from '@/lib/apps/qbittorrent';
import { relay } from '@/lib/apps/relay';
import { seerr } from '@/lib/apps/seerr';
import { stalwart } from '@/lib/apps/stalwart';

/** The apps the dashboard can read, by their image's name, "lscr.io/linuxserver/sonarr" → sonarr, or by a dash.app label. */
export const APPS: Record<string, App> = {
  sonarr,
  radarr,
  prowlarr,
  jellyfin,
  qbittorrent,
  // Jellyseerr, now published as seerr/seerr
  seerr,
  gluetun,
  flaresolverr,
  'minecraft-server': minecraft,
  postgres,
  garage,
  caddy,
  // Labelled dash.app: relay in its compose file, its image being named for its folder
  relay,
  stalwart,
  // Ludo's game server, built from its repository as ludo-server
  'ludo-server': ludo,
};
