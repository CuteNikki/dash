import 'server-only';

import { posix } from 'node:path';

import { db } from '@/lib/db';
import {
  composeConfig,
  composeOutput,
  runCompose,
  type Stack,
} from '@/lib/docker/compose';
import { listContainers } from '@/lib/docker/docker';
import type { RunLine } from '@/lib/docker/runner';
import { gitClone } from '@/lib/git';
import {
  createHostEntry,
  readHostFile,
  realHostPath,
  removeHostEntry,
  removeHostFile,
  writeHostFile,
} from '@/lib/host/host-files';
import { checkDomain } from '@/lib/stacks/domains';
import { CADDY_NETWORK, type NewServiceData } from '@/lib/stacks/new-service';
import {
  findCaddy,
  reloadCaddy,
  say,
  SERVICES_DIR,
  shown,
  siteFile,
} from '@/lib/stacks/service-stacks';

/** A new file, owned like the folder it's in, with its text. */
async function writeNewFile(path: string, content: string) {
  await createHostEntry(path, 'file');
  await writeHostFile(path, content);
}

/**
 * A file with this text, made if it isn't there; one already so, as a
 * repository's own compose file, is left alone, unchanged in git.
 */
async function writeFileAs(path: string, content: string) {
  const was = await readHostFile(path);
  if (was === undefined) await writeNewFile(path, content);
  else if (was.trimEnd() !== content.trimEnd())
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
 * Adds a service: its folder in ~/services, made or cloned from git, with
 * its compose file and .env, checked by Compose, started, and for a domain a site file for Caddy, which
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
    files: [posix.join(dir, input.composeFile)],
  };
  // What's been done so far, for undoing
  const done = { dir: false, up: false, site: false };
  let caddy: Awaited<ReturnType<typeof findCaddy>> | undefined;
  let site: string | undefined;

  try {
    // Compose knows a project by its name alone, wherever its folder is: up
    // would recreate another stack's containers from this file, and undoing
    // it take them down
    const taken = (await listContainers()).some(
      (c) => c.stack?.project === input.name
    );
    if (taken) {
      throw new Error(
        `There's already a compose project named ${input.name}: give this one another name`
      );
    }

    if (input.domain) {
      // Before anything's made, as Caddy can't get a certificate for a domain
      // that doesn't lead here
      const dns = await checkDomain(input.domain);
      if (dns.points !== 'here') {
        const server = dns.server.join(' or ');
        throw new Error(
          dns.points === 'nowhere'
            ? `${input.domain} has no DNS record yet: add an A record pointing it at ${server}, then try again`
            : `${input.domain} points at ${dns.addresses.join(', ')}, not this server (${server}): point it here, then try again`
        );
      }
      caddy = await findCaddy();
      site = siteFile(caddy.sites, input.name);
      if ((await readHostFile(site)) !== undefined) {
        throw new Error(`Caddy already has a site file named ${shown(site)}`);
      }
    }

    if (input.git) {
      // Before it's cloned, as undoing a failed clone removes the folder
      if (await realHostPath(dir)) {
        throw new Error(`There's already a folder ${shown(dir)}`);
      }
      yield say(`Cloning ${input.git.url} into ${shown(dir)}`);
      done.dir = true;
      yield* follow(
        gitClone(dir, input.git.url, input.git.branch),
        "Git couldn't clone it"
      );
    } else {
      yield say(`Creating ${shown(dir)}`);
      await createHostEntry(dir, 'dir');
      done.dir = true;
    }
    await writeFileAs(stack.files[0], input.compose.trimEnd() + '\n');
    if (input.env.trim()) {
      await writeFileAs(posix.join(dir, '.env'), input.env.trimEnd() + '\n');
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

    // A repository's own compose file has no label for its group, so its
    // tiles are given it here
    if (input.git && input.group) {
      const { services } = await composeConfig(stack);
      for (const service of Object.keys(services)) {
        const key = `${input.name}/${service}`;
        await db.tile.upsert({
          where: { key },
          create: { key, group: input.group },
          update: { group: input.group },
        });
      }
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
