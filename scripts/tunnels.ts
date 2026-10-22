// In development: tunnels to the apps whose numbers show on their tiles, which
// on the server are only reached by name on the arr stack's network. Each is
// looked up when it starts, since a recreated container has a new address,
// and is then on this machine at the port SONARR_URL and the rest name.
const SERVER = 'vps.niso.moe';

/** Each app's container, its port there, and its port here. */
const APPS = [
  { container: 'sonarr', port: 8989, local: 18989 },
  { container: 'radarr', port: 7878, local: 17878 },
  { container: 'prowlarr', port: 9696, local: 19696 },
  { container: 'jellyfin', port: 8096, local: 18096 },
  // qBittorrent shares the VPN container's network, so it's reached through it
  { container: 'gluetun', port: 8080, local: 18080 },
];

const lookup = Bun.spawn([
  'ssh',
  SERVER,
  `docker inspect -f '{{.Name}} {{(index .NetworkSettings.Networks "arr-stack_default").IPAddress}}' ${APPS.map((a) => a.container).join(' ')}`,
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
if (!forwards.length) process.exit(1);

console.log('Open until stopped (Ctrl+C)');
const tunnel = Bun.spawn(['ssh', '-N', ...forwards, SERVER], {
  stdout: 'inherit',
  stderr: 'inherit',
});
process.exit(await tunnel.exited);

export {};
