// In development: a tunnel to the server's Docker, at DOCKER_HOST, which
// everything dash shows comes through; and tunnels to the apps whose numbers
// show on their tiles, which on the server are only reached by name on the
// networks dash shares with them. Each app is looked up when it starts, since
// a recreated container has a new address, and is then on this machine at the
// port SONARR_URL and the rest name.
const SERVER = 'vps.niso.moe';

/** Where DOCKER_HOST in .env.local expects the server's Docker. */
const DOCKER = '127.0.0.1:2375';

/** Each app's container, its port there, and its port here. */
const APPS = [
  { container: 'sonarr', port: 8989, local: 18989 },
  { container: 'radarr', port: 7878, local: 17878 },
  { container: 'prowlarr', port: 9696, local: 19696 },
  { container: 'jellyfin', port: 8096, local: 18096 },
  { container: 'jellyseerr', port: 5055, local: 15055 },
  { container: 'flaresolverr', port: 8191, local: 18191 },
  { container: 'stalwart', port: 8080, local: 18088 },
  { container: 'ludo-server', port: 3001, local: 13001 },
  // qBittorrent shares the VPN container's network, so it's reached through
  // it, at its own port: it turns away a request whose address has another
  { container: 'gluetun', port: 8080, local: 8080 },
];

const lookup = Bun.spawn([
  'ssh',
  SERVER,
  `docker inspect -f '{{.Name}}{{range .NetworkSettings.Networks}} {{.IPAddress}}{{end}}' ${APPS.map((a) => a.container).join(' ')}`,
]);
const addresses = new Map(
  (await new Response(lookup.stdout).text())
    .trim()
    .split('\n')
    .map((line) => {
      const [name, ip] = line.split(' ');
      return [name.replace(/^\//, ''), ip] as const;
    })
);

const forwards = APPS.flatMap((a) => {
  const ip = addresses.get(a.container);
  if (!ip) {
    console.error(`${a.container} isn't running, so it's left out`);
    return [];
  }
  console.log(`${a.container}: http://127.0.0.1:${a.local}`);
  return ['-L', `127.0.0.1:${a.local}:${ip}:${a.port}`];
});
console.log(`Docker: tcp://${DOCKER}`);

console.log('Open until stopped (Ctrl+C)');
const tunnel = Bun.spawn(
  ['ssh', '-N', '-L', `${DOCKER}:/var/run/docker.sock`, ...forwards, SERVER],
  {
    stdout: 'inherit',
    stderr: 'inherit',
  }
);
process.exit(await tunnel.exited);

export {};
