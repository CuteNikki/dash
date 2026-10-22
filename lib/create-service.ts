import 'server-only';

import { posix } from 'node:path';

import { isCaddy, RELOAD_CADDY, reloadError } from '@/lib/caddy';
import {
  composeConfig,
  composeOutput,
  runCompose,
  type Stack,
} from '@/lib/compose';
import { execRun, listContainers } from '@/lib/docker';
import {
  createHostEntry,
  hostOwner,
  readHostFile,
  removeHostEntry,
  removeHostFile,
  writeHostFile,
} from '@/lib/host-files';
import { CADDY_NETWORK, type NewServiceData } from '@/lib/new-service';
import { STACKS_ROOT, type RunLine } from '@/lib/runner';
import { isRunning } from '@/lib/status';

/** Where every stack lives, a folder each. */
const SERVICES_DIR = posix.join(STACKS_ROOT, 'services');

const say = (line: string): RunLine => ({ stream: 'stdout', line });

/** A path as it reads on the server, the home folder as ~. */
const shown = (path: string) => path.replace(STACKS_ROOT, '~');

/** Caddy's container, and the folder its site files are imported from. */
async function findCaddy() {
  const caddy = (await listContainers()).find(
    (c) => isCaddy(c.image) && c.stack
  );
  if (!caddy || !isRunning(caddy.state)) {
    throw new Error(
      "Caddy isn't running, so there's nothing to add a domain to"
    );
  }
  const sites = posix.join(caddy.stack!.dir, 'sites');
  await hostOwner(sites).catch(() => {
    throw new Error(
      `Caddy has no ${shown(sites)} folder to add a site file to`
    );
  });
  return { id: caddy.id, sites };
}

/** Has Caddy read its config again; Caddy keeps the old one if it's wrong. */
async function reloadCaddy(id: string) {
  const { stderr, exitCode } = await execRun(id, RELOAD_CADDY);
  if (exitCode !== 0) throw new Error(reloadError(stderr));
}

/** A new file, owned like the folder it's in, with its text. */
async function writeNewFile(path: string, content: string) {
  await createHostEntry(path, 'file');
  await writeHostFile(path, content);
}

/**
 * The host and port Caddy sends a domain to: the service's container, by
 * name, which must be on Caddy's network to be found.
 */
async function upstreamOf(stack: Stack, service: string, port: string) {
  const config = await composeConfig(stack);
  const found = config.services[service];
  if (!found) {
    const names = Object.keys(config.services).join(', ');
    throw new Error(
      `There's no service named ${service} in the compose file (it has ${names})`
    );
  }
  const onCaddy = Object.keys(found.networks ?? {}).some(
    (key) => (config.networks?.[key]?.name ?? key) === CADDY_NETWORK
  );
  if (!onCaddy) {
    throw new Error(
      `${service} isn't on the ${CADDY_NETWORK} network, so Caddy can't reach it: add the network to it, as the template has`
    );
  }
  // Compose's own name for its container when it's given none
  const host = found.container_name ?? `${stack.project}-${service}-1`;
  return `${host}:${port}`;
}

/** Hands on a run's lines, and throws if it fails. */
async function* follow(
  run: AsyncGenerator<RunLine, number>,
  failure: string
): AsyncGenerator<RunLine, void> {
  for (;;) {
    const next = await run.next();
    if (next.done) {
      if (next.value !== 0) throw new Error(failure);
      return;
    }
    yield next.value;
  }
}

/**
 * Adds a service: its folder in ~/services with its compose file and .env,
 * checked by Compose, started, and for a domain a site file for Caddy, which
 * is then reloaded. Says what it's doing as it goes. If a step fails, the ones
 * before it are undone, so the same service can be tried again.
 */
export async function* createService(
  input: NewServiceData
): AsyncGenerator<RunLine, number> {
  const dir = posix.join(SERVICES_DIR, input.name);
  const stack: Stack = {
    project: input.name,
    dir,
    files: [posix.join(dir, 'docker-compose.yml')],
  };
  // What's been done so far, for undoing
  const done = { dir: false, up: false, site: false };
  let caddy: Awaited<ReturnType<typeof findCaddy>> | undefined;
  let site: string | undefined;

  try {
    if (input.domain) {
      caddy = await findCaddy();
      site = posix.join(caddy.sites, `${input.name}.caddy`);
      if ((await readHostFile(site)) !== undefined) {
        throw new Error(`Caddy already has a site file named ${shown(site)}`);
      }
    }

    yield say(`Creating ${shown(dir)}`);
    await createHostEntry(dir, 'dir');
    done.dir = true;
    await writeNewFile(stack.files[0], input.compose.trimEnd() + '\n');
    if (input.env.trim()) {
      await writeNewFile(posix.join(dir, '.env'), input.env.trimEnd() + '\n');
    }

    yield say('Checking the compose file');
    const checked = await composeOutput(stack, ['config', '-q']);
    if (!checked.ok) throw new Error(checked.output);
    const upstream = input.domain
      ? await upstreamOf(stack, input.service, input.port)
      : undefined;

    yield say('Starting it');
    done.up = true;
    yield* follow(runCompose(stack, ['up', '-d']), "Compose couldn't start it");

    if (caddy && site && upstream) {
      yield say(`Sending ${input.domain} to ${upstream}`);
      await writeNewFile(
        site,
        `# ${input.name} (${shown(dir)}), added from dash.\n${input.domain} {\n\treverse_proxy ${upstream}\n}\n`
      );
      done.site = true;
      await reloadCaddy(caddy.id);
    }

    yield say(`Added ${input.name}`);
    return 0;
  } catch (error) {
    for (const line of (error as Error).message.split('\n')) {
      yield { stream: 'stderr', line };
    }
    if (done.dir) yield say('Undoing what was done, so it can be tried again');
    // Each step undone even if another can't be, so as little as can be is left
    if (done.site && caddy && site) {
      await removeHostFile(site).catch(() => {});
      await reloadCaddy(caddy.id).catch(() => {});
    }
    if (done.up) {
      try {
        yield* follow(runCompose(stack, ['down']), "Compose couldn't stop it");
      } catch (undo) {
        yield { stream: 'stderr', line: (undo as Error).message };
      }
    }
    if (done.dir) await removeHostEntry(dir).catch(() => {});
    return 1;
  }
}
