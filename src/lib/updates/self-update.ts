import 'server-only';

import { posix } from 'node:path';

import { record } from '@/lib/activity/record';
import { composeRun, type Stack } from '@/lib/docker/compose';
import { STACKS_ROOT, startRun, type RunLine } from '@/lib/docker/runner';
import { readHostFile, writeHostFile } from '@/lib/host/host-files';

/**
 * The dashboard's own rebuild runs as a job of its own on the server, as the
 * end of it recreates the dashboard, and whatever follows it from the
 * dashboard with it: building, migrating the database, then recreating the
 * dashboard on the new build. It writes what it does to a log, when it began,
 * and how it ended once it has, so it's followed from its start by any
 * window, the one that began it, one opened since, or one of the new
 * dashboard's, which reads the same files. They're in the home folder, out of
 * the repository and so out of git's and the build's way.
 */
const DIR = posix.join(STACKS_ROOT, '.cache', 'dash', 'update');
const LOG = posix.join(DIR, 'log');
const STARTED = posix.join(DIR, 'started');
const STATUS = posix.join(DIR, 'status');
/** Who began it, for the activity log, and whether it's noted there yet. */
const BY = posix.join(DIR, 'by');
const NOTED = posix.join(DIR, 'noted');

/** Who began a rebuild, and what it brings, as the activity log notes it. */
export type SelfUpdateBy = {
  who?: { user: { id: string; name: string } };
  target: string;
  detail?: string;
};

/** A job begun this long ago that hasn't said how it ended is taken to have died. */
const STALE_MS = 60 * 60_000;

/** How often the log's read for what's new. */
const POLL_MS = 1_000;

const quote = (word: string) => `'${word.replaceAll("'", `'\\''`)}'`;

/** A Compose command for the stack, as the job's shell runs it. */
const compose = (stack: Stack, args: string[]) =>
  composeRun(stack, args).cmd.map(quote).join(' ');

/** Starts the rebuild as a job of its own, after the dashboard's pulled the new commits. */
export async function startSelfUpdate(stack: Stack, by: SelfUpdateBy) {
  const run = composeRun(stack, []);
  const script = `D=${quote(DIR)}
mkdir -p "$D" && : > "$D/log" && rm -f "$D/status" "$D/noted" && date +%s > "$D/started"
printf %s ${quote(JSON.stringify(by))} > "$D/by"
step() {
  echo "$1" >> "$D/log"; shift
  "$@" >> "$D/log" 2>&1 || { code=$?; echo "Exited with $code" >> "$D/log"; echo "$code" > "$D/status"; exit "$code"; }
}
step 'Building the dashboard…' ${compose(stack, ['build'])}
step 'Migrating its database…' ${compose(stack, ['run', '--rm', 'migrate'])}
step "Restarting the dashboard on the new build; it's back in a moment" ${compose(stack, ['up', '-d'])}
echo 'Done' >> "$D/log"
echo 0 > "$D/status"`;
  await startRun({ ...run, cmd: ['sh', '-c', script] });
}

/** Whether the dashboard's rebuild is going on now: begun, and not yet ended. */
export async function selfUpdateRunning() {
  const [started, status] = await Promise.all([
    readHostFile(STARTED).catch(() => undefined),
    readHostFile(STATUS).catch(() => undefined),
  ]);
  if (!started || status !== undefined) return false;
  return Date.now() - Number(started) * 1000 < STALE_MS;
}

/** Whether a rebuild began at `ms` or since, as one an update handed on to. */
export async function selfUpdateStartedSince(ms: number) {
  const started = await readHostFile(STARTED).catch(() => undefined);
  return !!started && Number(started) >= Math.floor(ms / 1000);
}

/** Whether there's a rebuild to follow: one going on, or one that ended lately. */
export async function selfUpdateToFollow() {
  const started = await readHostFile(STARTED).catch(() => undefined);
  return !!started && Date.now() - Number(started) * 1000 < STALE_MS;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The rebuild's log from its start, line by line as it's written, until it
 * says how it ended: that's what it returns. One whose job died without
 * saying, as when the server restarted, ends as failed once it's stale.
 */
export async function* followSelfUpdate(): AsyncGenerator<RunLine, number> {
  let shown = 0;
  for (;;) {
    const [log, status, started] = await Promise.all([
      readHostFile(LOG).catch(() => undefined),
      readHostFile(STATUS).catch(() => undefined),
      readHostFile(STARTED).catch(() => undefined),
    ]);
    const lines = (log ?? '').split('\n');
    // The last line may be half written; it's shown once it's whole
    const whole = status === undefined ? lines.slice(0, -1) : lines;
    for (const line of whole.slice(shown)) {
      if (line) yield { stream: 'stdout', line };
    }
    shown = Math.max(shown, whole.length);
    if (status !== undefined) return Number(status.trim()) || 0;
    if (!started || Date.now() - Number(started) * 1000 > STALE_MS) {
      yield {
        stream: 'stderr',
        line: 'The rebuild stopped without saying how it ended',
      };
      return 1;
    }
    await wait(POLL_MS);
  }
}

/**
 * Notes a rebuild that's ended in the activity log, once, by whichever
 * dashboard sees it first: the one that began it, its build having failed,
 * or the new one, as the one that began it was gone before it ended.
 */
export async function noteSelfUpdate() {
  const [status, noted, by, log] = await Promise.all([
    readHostFile(STATUS).catch(() => undefined),
    readHostFile(NOTED).catch(() => undefined),
    readHostFile(BY).catch(() => undefined),
    readHostFile(LOG).catch(() => undefined),
  ]);
  if (status === undefined || noted !== undefined || !by) return;
  await writeHostFile(NOTED, '');
  const { who, target, detail }: SelfUpdateBy = JSON.parse(by);
  const code = Number(status.trim()) || 0;
  // What it said last before saying how it exited
  const said = (log ?? '').split('\n').filter(Boolean);
  await record(who, {
    action: 'update',
    target,
    detail,
    ok: code === 0,
    error: said.at(-2) ?? `Exited with ${code}`,
  });
}
