// In development: a tunnel to the server's Docker, at DOCKER_HOST, which
// everything the dashboard shows comes through; and tunnels to the apps whose numbers
// show on their tiles, which on the server are only reached by name on the
// networks the dashboard shares with them. Each app is looked up when it starts, since
// a recreated container has a new address, and is then on this machine at the
// port the dashboard looks for it at in development (src/lib/apps/tunnels.ts).
import { DEV_TUNNELS } from '../src/lib/apps/tunnels';

// The server as SSH knows it, from .env.local, which Bun reads
const SERVER = process.env.DASH_SSH_HOST;
if (!SERVER) {
  console.error(
    'Set DASH_SSH_HOST in .env.local to the server, as ssh knows it'
  );
  process.exit(1);
}

/** Where DOCKER_HOST in .env.local expects the server's Docker. */
const DOCKER = '127.0.0.1:2375';

/** Each app's container, its port there, and its port here, as the dashboard expects them. */
const APPS = DEV_TUNNELS;

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
