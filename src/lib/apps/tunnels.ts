/**
 * In development, the apps whose numbers show on tiles are reached through
 * `bun run tunnels`, as on the server they're only reached by name on the
 * networks the dashboard shares with them: each app's container, its port
 * there, and the port here it's forwarded to. The dashboard goes to these by
 * itself in development, unless SONARR_URL and the like say otherwise.
 */
export const DEV_TUNNELS = [
  { app: 'sonarr', container: 'sonarr', port: 8989, local: 18989 },
  { app: 'radarr', container: 'radarr', port: 7878, local: 17878 },
  { app: 'prowlarr', container: 'prowlarr', port: 9696, local: 19696 },
  { app: 'jellyfin', container: 'jellyfin', port: 8096, local: 18096 },
  { app: 'seerr', container: 'jellyseerr', port: 5055, local: 15055 },
  { app: 'flaresolverr', container: 'flaresolverr', port: 8191, local: 18191 },
  { app: 'stalwart', container: 'stalwart', port: 8080, local: 18088 },
  { app: 'ludo-server', container: 'ludo-server', port: 3001, local: 13001 },
  // qBittorrent shares the VPN container's network, so it's reached through
  // it, at its own port here too: it turns away a request whose address has
  // another
  { app: 'qbittorrent', container: 'gluetun', port: 8080, local: 8080 },
];

/** Where an app is in development, through its tunnel, if it has one. */
export function devTunnelUrl(app: string) {
  const tunnel = DEV_TUNNELS.find((t) => t.app === app);
  return tunnel && `http://127.0.0.1:${tunnel.local}`;
}
