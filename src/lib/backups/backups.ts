import 'server-only';

import { posix } from 'node:path';

import { reconcile, type Finding } from '@/lib/alerts/alerts';
import { run as runInApp } from '@/lib/apps/app';
import { buckets } from '@/lib/apps/garage';
import { db } from '@/lib/db';
import { listContainers, type Container } from '@/lib/docker/docker';
import {
  RUN_LABEL,
  runContainer,
  runToEnd,
  type RunLine,
} from '@/lib/docker/runner';
import { imageName } from '@/lib/format';
import { listHostDir } from '@/lib/host/host-files';
import { asHost } from '@/lib/host/system-updates';
import { postgresDatabases } from '@/lib/postgres';
import { DASH_PROJECT } from '@/lib/site';
import { SERVICES_DIR } from '@/lib/stacks/service-stacks';
import { storageKeyId } from '@/lib/storage';

/**
 * Backups, by restic on the server itself: each database dumped, each
 * folder in ~/services and each folder added here, every night, the last
 * seven kept. restic keeps what doesn't change from night to night once,
 * so seven nights take little more than one. Its repository is a bucket in
 * the server's Garage, with the dashboard's own key, unless BACKUP_REPOSITORY
 * names another, as storage elsewhere; BACKUP_PASSWORD, which nothing can be
 * read back without, turns them on.
 */

const RESTIC = '0.18.1';
const BIN = '/var/lib/dash/restic';
const CACHE = '/var/cache/dash-restic';
/** The bucket in the server's Garage. */
const BUCKET = 'backups';
/** Each part's last so many backups are kept. */
export const KEEP = 7;
/**
 * When the nightly run starts, in UTC: 03:30, an hour or two after midnight
 * wherever the server is in Europe, clear of a host's own backup at 03:25.
 */
const NIGHTLY = process.env.BACKUP_TIME || '03:30';

type Config = {
  repository: string;
  env: Record<string, string>;
  local: boolean;
};

/** How restic reaches the repository, or why backups are off. */
export function backupConfig(): Config | { off: string } {
  const password = process.env.BACKUP_PASSWORD;
  if (!password) {
    return {
      off: "Set BACKUP_PASSWORD in the dashboard's .env to turn backups on",
    };
  }
  const own = process.env.BACKUP_REPOSITORY;
  if (own) {
    return {
      repository: own,
      local: false,
      env: {
        RESTIC_REPOSITORY: own,
        RESTIC_PASSWORD: password,
        ...(process.env.BACKUP_ACCESS_KEY_ID && {
          AWS_ACCESS_KEY_ID: process.env.BACKUP_ACCESS_KEY_ID,
          AWS_SECRET_ACCESS_KEY: process.env.BACKUP_SECRET_ACCESS_KEY ?? '',
        }),
      },
    };
  }
  const url = process.env.STORAGE_API_URL;
  const key = process.env.STORAGE_ACCESS_KEY_ID;
  const secret = process.env.STORAGE_SECRET_ACCESS_KEY;
  if (!url || !key || !secret) {
    return {
      off: "Set the storage's keys, or BACKUP_REPOSITORY, for where backups go",
    };
  }
  const repository = `s3:${url.replace(/\/$/, '')}/${BUCKET}`;
  return {
    repository,
    local: true,
    env: {
      RESTIC_REPOSITORY: repository,
      RESTIC_PASSWORD: password,
      AWS_ACCESS_KEY_ID: key,
      AWS_SECRET_ACCESS_KEY: secret,
      AWS_DEFAULT_REGION: 'garage',
      RESTIC_HOST: 'dash',
    },
  };
}

/** A part of the backups: a database, or a folder. */
export type Source =
  | {
      id: string;
      kind: 'postgres';
      label: string;
      enabled: boolean;
      /** The Postgres container and the database */
      container: string;
      database: string;
    }
  | {
      id: string;
      kind: 'folder';
      label: string;
      enabled: boolean;
      path: string;
      /** Added here, rather than found in ~/services */
      added: boolean;
    };

const quote = (text: string) => `'${text.replaceAll("'", `'\\''`)}'`;

/** Postgres containers, which are backed up by their dumps rather than their files. */
const isPostgres = (c: Container) => imageName(c.image) === 'postgres';
/** Garage, whose own storage holds the backups, so it isn't backed up into itself. */
const isGarage = (c: Container) => imageName(c.image) === 'garage';

/**
 * Every part there is to back up: each running Postgres container's
 * databases, each folder in ~/services, and the folders added here, each
 * on unless switched off here.
 */
export async function listSources(containers?: Container[]) {
  const all = containers ?? (await listContainers());
  const settings = await db.backupSource.findMany();
  const off = new Set(settings.filter((s) => !s.enabled).map((s) => s.id));
  const sources: Source[] = [];
  // The dashboard's own short-lived ones, as a test's, aren't the server's
  const postgres = all.filter(
    (c) => isPostgres(c) && c.state === 'running' && !c.labels[RUN_LABEL]
  );
  for (const c of postgres) {
    for (const database of await postgresDatabases(c.id).catch(() => [])) {
      const id = `postgres/${database.name}`;
      sources.push({
        id,
        kind: 'postgres',
        label: database.name,
        enabled: !off.has(id),
        container: c.name,
        database: database.name,
      });
    }
  }
  const folders = await listHostDir(SERVICES_DIR).catch(() => []);
  for (const f of folders) {
    if (f.kind !== 'dir' || f.name.startsWith('.')) continue;
    const id = `folder/${f.name}`;
    sources.push({
      id,
      kind: 'folder',
      label: `~/services/${f.name}`,
      enabled: !off.has(id),
      path: posix.join(SERVICES_DIR, f.name),
      added: false,
    });
  }
  for (const s of settings) {
    if (!s.path) continue;
    sources.push({
      id: s.id,
      kind: 'folder',
      label: s.path,
      enabled: s.enabled,
      path: s.path,
      added: true,
    });
  }
  return sources;
}

/**
 * A script run on the server with restic ready: installed from its image the
 * first time, at the version above, its repository made if there isn't one.
 * `r` runs it.
 */
function withRestic(body: string) {
  return `set -e
BIN=${BIN}
if ! [ -x "$BIN" ] || ! "$BIN" version | grep -q "restic ${RESTIC} "; then
  echo "Installing restic ${RESTIC}…"
  mkdir -p ${posix.dirname(BIN)}
  id=$(docker create restic/restic:${RESTIC})
  docker cp "$id:/usr/bin/restic" "$BIN.new" && docker rm "$id" >/dev/null
  mv "$BIN.new" "$BIN"
fi
r() { "$BIN" --cache-dir ${CACHE} "$@"; }
r cat config >/dev/null 2>&1 || { echo "Making the backups' repository…"; r init; }
${body}`;
}

function hostRun(config: Config, body: string) {
  return asHost(withRestic(body), { shell: '/bin/bash', env: config.env });
}

/** Lets the dashboard's key into the bucket in Garage, making it the first time. */
async function ensureBucket(config: Config, containers: Container[]) {
  if (!config.local) return;
  const garage = containers.find((c) => isGarage(c) && c.state === 'running');
  const key = storageKeyId();
  if (!garage || !key)
    throw new Error("Garage isn't running to keep the backups in");
  if (!(await buckets(garage)).some((b) => b.name === BUCKET)) {
    await runInApp(garage, ['/garage', 'bucket', 'create', BUCKET]);
  }
  await runInApp(garage, [
    '/garage',
    'bucket',
    'allow',
    '--read',
    '--write',
    '--owner',
    '--key',
    key,
    BUCKET,
  ]);
}

/**
 * What backing up a part runs: a database's dump into restic as it's made,
 * or a folder, without what's rebuilt anyway (node_modules, .next) nor what
 * Postgres and Garage keep, which a dump stands in for or which holds the
 * backups themselves. Minecraft's world is copied with saving held off, so
 * it's whole. Tagged with the part, and `extra` tags.
 */
function backupCommand(
  s: Source,
  containers: Container[],
  extra: string[] = []
) {
  const tags = [`source=${s.id}`, ...extra]
    .map((t) => `--tag ${quote(t)}`)
    .join(' ');
  if (s.kind === 'postgres') {
    return `r backup ${tags} --stdin-filename ${quote(`postgres/${s.database}.dump`)} --stdin-from-command -- docker exec ${quote(s.container)} pg_dump -U postgres -Fc ${quote(s.database)}`;
  }
  const skipped = containers
    .filter((c) => isPostgres(c) || isGarage(c))
    .flatMap((c) => c.binds)
    .filter((b) => b.startsWith(`${s.path}/`));
  const excludes = [
    '--exclude-caches',
    '--exclude node_modules',
    '--exclude .next',
    ...skipped.map((b) => `--exclude ${quote(b)}`),
  ].join(' ');
  const backup = `r backup ${tags} ${excludes} ${quote(s.path)}`;
  const minecraft = containers.find(
    (c) =>
      c.state === 'running' &&
      imageName(c.image) === 'minecraft-server' &&
      c.binds.some((b) => b === s.path || b.startsWith(`${s.path}/`))
  );
  if (!minecraft) return backup;
  const mc = (command: string) =>
    `docker exec ${quote(minecraft.name)} rcon-cli ${quote(command)} >/dev/null`;
  return `${mc('save-off')}
trap '${mc('save-on').replaceAll("'", `'\\''`)}' EXIT
${mc('save-all flush')}
sleep 3
${backup}`;
}

/** restic's exit code 3: backed up, but some files couldn't be read. */
const PARTLY = 3;

type Result = { source: string; ok: boolean; error?: string; added?: string };

type State = { running?: 'backup' | 'restore' };
const state: State = ((
  globalThis as typeof globalThis & { backupState?: State }
).backupState ??= {});

export const backupRunning = () => state.running;

/**
 * Backs up every part that's on, one after another, then forgets all but
 * each one's last seven and frees what nothing needs any more. Yields what
 * restic says, and returns how it went: 0, or 1 if any part failed, each
 * part's outcome being kept with the run and failures raised as alerts.
 */
export async function* runBackups(
  trigger: string
): AsyncGenerator<RunLine, number> {
  const config = backupConfig();
  if ('off' in config) throw new Error(config.off);
  if (state.running) throw new Error('Backups are already running');
  state.running = 'backup';
  const run = await db.backupRun.create({ data: { trigger } });
  const results: Result[] = [];
  try {
    const containers = await listContainers();
    await ensureBucket(config, containers);
    const sources = (await listSources(containers)).filter((s) => s.enabled);
    for (const source of sources) {
      yield { stream: 'stdout', line: `— ${source.label}` };
      const lines: string[] = [];
      const it = runContainer(
        hostRun(config, backupCommand(source, containers))
      );
      let code: number;
      for (;;) {
        const next = await it.next();
        if (next.done) {
          code = next.value;
          break;
        }
        lines.push(next.value.line);
        yield next.value;
      }
      const added = lines
        .map((l) => l.match(/^Added to the repository: ([^(]+)/)?.[1]?.trim())
        .find(Boolean);
      results.push(
        code === 0 || code === PARTLY
          ? {
              source: source.id,
              ok: true,
              added,
              error:
                code === PARTLY ? "Some files couldn't be read" : undefined,
            }
          : {
              source: source.id,
              ok: false,
              error: lines.filter(Boolean).at(-1) ?? `Exited with ${code}`,
            }
      );
    }
    yield { stream: 'stdout', line: `— Keeping each part's last ${KEEP}` };
    const prune = runContainer(
      hostRun(config, `r forget --group-by tags --keep-last ${KEEP} --prune`)
    );
    for (;;) {
      const next = await prune.next();
      if (next.done) break;
      yield next.value;
    }
    return results.every((r) => r.ok) ? 0 : 1;
  } finally {
    state.running = undefined;
    await db.backupRun.update({
      where: { id: run.id },
      data: { finishedAt: new Date(), results },
    });
    snapshotsCache.at = 0;
    await raiseFailures(results).catch(console.error);
  }
}

/** A part that failed is an alert, until it's backed up again. */
async function raiseFailures(results: Result[]) {
  const sources = await listSources().catch(() => []);
  const label = (id: string) => sources.find((s) => s.id === id)?.label ?? id;
  const findings: Finding[] = results
    .filter((r) => !r.ok)
    .map((r) => ({
      key: `backup:${r.source}`,
      kind: 'backup',
      subject: `Backup of ${label(r.source)}`,
      message: r.error ?? 'Failed',
    }));
  const covered = new Set(results.map((r) => `backup:${r.source}`));
  await reconcile((a) => a.kind === 'backup' && covered.has(a.key), findings);
}

/** One backup of a part, as restic keeps it. */
export type Snapshot = {
  id: string;
  /** Milliseconds since 1970 */
  at: number;
  source: string;
  /** Taken just before a restore, of what was there */
  beforeRestore: boolean;
};

const snapshotsCache: {
  at: number;
  value?: { snapshots: Snapshot[]; size?: number };
} = { at: 0 };

/** Every backup there is, newest first, and what the repository takes up; read again a minute on. */
export async function readSnapshots() {
  const config = backupConfig();
  if ('off' in config) return { snapshots: [] as Snapshot[] };
  if (snapshotsCache.value && Date.now() - snapshotsCache.at < 60_000) {
    return snapshotsCache.value;
  }
  const { ok, lines } = await runToEnd(
    hostRun(
      config,
      `echo "SNAPSHOTS $(r snapshots --json --no-lock)"
echo "STATS $(r stats --mode raw-data --json --no-lock)"`
    )
  );
  if (!ok) {
    throw new Error(
      lines.filter((l) => l.stream === 'stderr').at(-1)?.line ?? 'restic failed'
    );
  }
  const json = (name: string) => {
    const line = lines.find((l) => l.line.startsWith(`${name} `))?.line;
    return line ? JSON.parse(line.slice(name.length + 1)) : undefined;
  };
  const raw = (json('SNAPSHOTS') ?? []) as {
    short_id: string;
    time: string;
    tags?: string[];
  }[];
  const snapshots = raw
    .map((s) => ({
      id: s.short_id,
      at: Date.parse(s.time),
      source:
        s.tags?.find((t) => t.startsWith('source='))?.slice('source='.length) ??
        '',
      beforeRestore: !!s.tags?.includes('before-restore'),
    }))
    .filter((s) => s.source)
    .sort((a, b) => b.at - a.at);
  const value = {
    snapshots,
    size: (json('STATS') as { total_size?: number } | undefined)?.total_size,
  };
  snapshotsCache.value = value;
  snapshotsCache.at = Date.now();
  return value;
}

/**
 * Puts a part back as a backup has it, first backing up what's there now, so
 * a restore can be undone by restoring that. A database is restored from its
 * dump over the one there, by pg_restore --clean; a folder's containers are
 * stopped while its files are put back, those the backup doesn't have
 * removed, and started again. The dashboard's own folder isn't restored
 * from here, as that would stop the dashboard partway.
 */
export async function* restoreBackup(
  sourceId: string,
  snapshotId: string
): AsyncGenerator<RunLine, number> {
  const config = backupConfig();
  if ('off' in config) throw new Error(config.off);
  if (state.running) throw new Error('Backups are already running');
  if (!/^[0-9a-f]{8,64}$/.test(snapshotId)) throw new Error('Not a backup');
  const containers = await listContainers();
  const source = (await listSources(containers)).find((s) => s.id === sourceId);
  if (!source) throw new Error('No such part to restore');
  const { snapshots } = await readSnapshots();
  if (!snapshots.some((s) => s.id === snapshotId && s.source === sourceId)) {
    throw new Error("That backup isn't of this part");
  }
  state.running = 'restore';
  try {
    const safety = backupCommand(source, containers, ['before-restore']);
    let body: string;
    if (source.kind === 'postgres') {
      body = `echo "Backing up the database as it is now, first…"
${safety}
echo "Restoring ${source.database}…"
set -o pipefail
r dump ${snapshotId} ${quote(`/postgres/${source.database}.dump`)} | docker exec -i ${quote(source.container)} pg_restore -U postgres --clean --if-exists -d ${quote(source.database)}
echo "Done"`;
    } else {
      const own = containers.filter(
        (c) =>
          c.state !== 'exited' &&
          (c.stack?.dir === source.path ||
            c.binds.some(
              (b) => b === source.path || b.startsWith(`${source.path}/`)
            ))
      );
      if (own.some((c) => c.stack?.project === DASH_PROJECT)) {
        throw new Error(
          "The dashboard's own folder is restored by hand, as it would stop the dashboard partway"
        );
      }
      const names = own.map((c) => quote(c.name)).join(' ');
      body = `echo "Backing up the folder as it is now, first…"
${safety}
${
  names
    ? `echo "Stopping ${own.map((c) => c.name).join(', ')}…"
docker stop ${names} >/dev/null
trap 'echo "Starting them again…"; docker start ${names} >/dev/null' EXIT`
    : ''
}
echo "Restoring ${source.label}…"
r restore ${quote(`${snapshotId}:${source.path}`)} --target ${quote(source.path)} --delete
echo "Done"`;
    }
    const it = runContainer(hostRun(config, body));
    for (;;) {
      const next = await it.next();
      if (next.done) return next.value;
      yield next.value;
    }
  } finally {
    state.running = undefined;
    snapshotsCache.at = 0;
  }
}

/** The last run: when, whether it's done, and each part's outcome. */
export async function lastRun() {
  const run = await db.backupRun.findFirst({ orderBy: { startedAt: 'desc' } });
  return (
    run && {
      startedAt: run.startedAt.getTime(),
      finishedAt: run.finishedAt?.getTime(),
      trigger: run.trigger,
      results: run.results as Result[],
    }
  );
}

/** "03:30" as minutes past midnight, UTC. */
function nightlyMinute() {
  const [h, m] = NIGHTLY.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

/** When the nightly run starts, as it's set: "03:30 UTC". */
export const nightlyAt = () => `${NIGHTLY} UTC`;

/**
 * From the monitor"s minute: starts the night's run once it"s time, if
 * backups are on and tonight's hasn't run, leaving it to run in the
 * background as long as it takes.
 */
export async function maybeRunNightly() {
  if ('off' in backupConfig() || state.running) return;
  const now = new Date();
  const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
  if (minute < nightlyMinute()) return;
  const since = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  );
  since.setUTCMinutes(nightlyMinute());
  const done = await db.backupRun.findFirst({
    where: { trigger: 'schedule', startedAt: { gte: since } },
    select: { id: true },
  });
  if (done) return;
  void (async () => {
    const it = runBackups('schedule');
    for (;;) if ((await it.next()).done) break;
  })().catch((error) => console.error('Nightly backup:', error));
}
