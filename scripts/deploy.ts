// Puts the dashboard on the server: the committed files go to ~/services/dash,
// then it's built and started there. Its .env, kept only there, stays.
const SERVER = 'vps.niso.moe';
const DIR = '~/services/dash';

/** Runs a command, its output shown, and stops everything if it fails. */
async function run(cmd: string[], stdin?: ReadableStream<Uint8Array>) {
  const child = Bun.spawn(cmd, {
    stdin: stdin ?? 'inherit',
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

console.log(
  `Sending ${await git('rev-parse', '--short', 'HEAD')} to ${SERVER}…`
);
const archive = Bun.spawn(['git', 'archive', '--format=tar', 'HEAD'], {
  stdout: 'pipe',
});
// Everything but .env is replaced, so files deleted here go there too
await run(
  [
    'ssh',
    SERVER,
    `set -e; mkdir -p ${DIR}; cd ${DIR}; find . -mindepth 1 -maxdepth 1 ! -name .env -exec rm -rf {} +; tar -x`,
  ],
  archive.stdout
);
console.log('Building and starting it…');
await run(['ssh', SERVER, `cd ${DIR} && docker compose up -d --build`]);
console.log('Done: https://dash.niso.moe');

export {};
