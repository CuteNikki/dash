// Puts the dashboard on the server, as its own Update does there: master is
// pushed, pulled into ~/services/dash, a clone of the repository, then built
// and started. Its .env, kept only there, stays.
// The server as SSH knows it, and the dashboard's clone there, from .env.local, which
// Bun reads
const SERVER = process.env.DASH_SSH_HOST;
const DIR = process.env.DASH_SERVER_DIR || '~/services/dash';
if (!SERVER) {
  console.error(
    'Set DASH_SSH_HOST in .env.local to the server, as ssh knows it'
  );
  process.exit(1);
}
const BRANCH = 'master';

/** Runs a command, its output shown, and stops everything if it fails. */
async function run(cmd: string[]) {
  const child = Bun.spawn(cmd, {
    stdin: 'inherit',
    stdout: 'inherit',
    stderr: 'inherit',
  });
  const code = await child.exited;
  if (code !== 0) throw new Error(`${cmd.join(' ')} exited with ${code}`);
}

/** What a git command prints. */
async function git(...args: string[]) {
  return (await new Response(Bun.spawn(['git', ...args]).stdout).text()).trim();
}

// Only what's committed goes up, so a half-done change never does
const changes = await git('status', '--porcelain');
if (changes) {
  console.error('Commit or put aside your changes first; only commits go up:');
  console.error(changes);
  process.exit(1);
}
// The server follows master, so that's what's sent
const branch = await git('branch', '--show-current');
if (branch !== BRANCH) {
  console.error(`On ${branch || 'no branch'}; the server follows ${BRANCH}`);
  process.exit(1);
}

console.log(`Pushing ${await git('rev-parse', '--short', 'HEAD')}…`);
await run(['git', 'push', 'origin', BRANCH]);
console.log(`Pulling it on ${SERVER}, building and starting it…`);
await run([
  'ssh',
  SERVER,
  `set -e; cd ${DIR}; git pull --ff-only; docker compose up -d --build`,
]);
console.log('Done');

export {};
