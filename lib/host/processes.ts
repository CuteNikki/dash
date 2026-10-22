import 'server-only';

import { hostname } from 'node:os';

import { containerPid } from '@/lib/docker/docker';
import { runToEnd, STACKS_ROOT, type Run } from '@/lib/docker/runner';
import type { ProcessDetails, StopResult } from '@/lib/types';

/**
 * Looking at and stopping the server's processes, from a short-lived
 * container that sees them, as git and compose run: the dashboard needs no
 * more rights of its own. It gets the server's users to name who runs what.
 */
const IMAGE = 'alpine:3.22';

async function hostScript(
  { signals }: { signals: boolean },
  script: string,
  ...args: string[]
) {
  const run: Run = {
    image: IMAGE,
    entrypoint: ['sh', '-c', script, 'sh'],
    cmd: args,
    workingDir: STACKS_ROOT,
    hostProcesses: true,
    signalsHost: signals,
    binds: ['/etc/passwd:/etc/passwd:ro', '/etc/group:/etc/group:ro'],
  };
  const { exitCode, lines } = await runToEnd(run);
  return {
    exitCode,
    stdout: lines
      .filter((l) => l.stream === 'stdout')
      .map((l) => l.line)
      .join('\n'),
    stderr: lines
      .filter((l) => l.stream === 'stderr')
      .map((l) => l.line)
      .join('\n'),
  };
}

/** The kernel's counters run at this many ticks a second, fixed on Linux. */
const TICKS_PER_SECOND = 100;

/** Exit codes the scripts below use */
const GONE = 3;
const REPLACED = 5;
const STILL_RUNNING = 4;

/** How long a stop is watched for: this many checks, this far apart, five seconds in all. */
const WAIT_STEPS = 20;
const WAIT_STEP_SECONDS = 0.25;

/**
 * What the server can't do without, by the name the kernel keeps: its init,
 * Docker and what runs containers, SSH (and with it, a way in), and the web
 * server in front of everything.
 */
const ESSENTIAL =
  /^(systemd.*|init|kthreadd|dockerd|containerd|containerd-shim.*|sshd|sshd-session|caddy)$/;

const STATES: Record<string, string> = {
  R: 'Running',
  S: 'Sleeping',
  D: 'Waiting on the disk',
  Z: 'Ended, not yet cleared',
  T: 'Paused',
  t: 'Paused by a debugger',
  I: 'Idle',
};

function lockedReason(
  d: Pick<ProcessDetails, 'pid' | 'parentPid' | 'name' | 'containerId'>
) {
  if (d.pid === 1)
    return 'It’s the server’s own first process, which runs all the others.';
  if (d.pid === 2 || d.parentPid === 2) return 'It’s part of the kernel.';
  if (ESSENTIAL.test(d.name)) {
    return 'The server depends on it: stopping it could take every service down, or lock you out.';
  }
  // A container's id begins with its hostname, so this is the dashboard's own
  if (d.containerId?.startsWith(hostname())) return 'It’s this dashboard.';
  return undefined;
}

/** The parts of /proc/<pid>/stat after its name, which can hold spaces of its own. */
function statFields(stat: string) {
  const close = stat.lastIndexOf(')');
  return {
    name: stat.slice(stat.indexOf('(') + 1, close),
    // From the state on, so the kernel's field 3 is [0] here
    fields: stat
      .slice(close + 2)
      .trim()
      .split(' '),
  };
}

export async function processDetails(
  pid: number
): Promise<ProcessDetails | undefined> {
  const marker = '--dash--';
  const { exitCode, stdout, stderr } = await hostScript(
    { signals: false },
    `p=/proc/$1; [ -d "$p" ] || exit ${GONE}
cat "$p/stat"; echo ${marker}
cat "$p/status"; echo ${marker}
tr '\\0' ' ' < "$p/cmdline"; echo; echo ${marker}
cat "$p/cgroup"; echo ${marker}
cat /proc/uptime; echo ${marker}
cat /etc/passwd`,
    String(pid)
  );
  if (exitCode === GONE) return undefined;
  if (exitCode !== 0) throw new Error(stderr || `Couldn't look at ${pid}`);

  const [stat, status, command, cgroup, uptime, passwd] = stdout.split(
    `${marker}\n`
  );
  const { name, fields } = statFields(stat);
  const field = (key: string) =>
    status.match(new RegExp(`^${key}:\\s+(.+)$`, 'm'))?.[1] ?? '';
  const uid = field('Uid').split(/\s+/)[0];
  const user =
    passwd
      .split('\n')
      .map((l) => l.split(':'))
      .find((cols) => cols[2] === uid)?.[0] ?? `uid ${uid}`;
  // Ticks since boot when it started: the kernel's field 22
  const start = Number(fields[19]);
  const secondsUp = Number(uptime.split(/\s+/)[0]);
  const containerId = cgroup.match(/docker[-/]([0-9a-f]{64})/)?.[1];

  const details: ProcessDetails = {
    pid,
    name,
    command: command.trim(),
    user,
    state: STATES[fields[0]] ?? fields[0],
    threads: Number(field('Threads')),
    parentPid: Number(fields[1]),
    startedAt: Date.now() - (secondsUp - start / TICKS_PER_SECOND) * 1000,
    runningFor: secondsUp - start / TICKS_PER_SECOND,
    start,
    memory: Number(field('VmRSS').split(/\s+/)[0] || 0) * 1024,
    containerId,
    containerMain: containerId
      ? (await containerPid(containerId).catch(() => 0)) === pid
      : undefined,
  };
  details.locked = lockedReason(details);
  return details;
}

/**
 * Asks a process to stop (or, forced, makes it), then waits a few seconds to
 * see it go. Only if it's still the process that was looked at: an id can be
 * given to a new process once its last one ends.
 */
export async function stopProcess(
  pid: number,
  start: number,
  force: boolean
): Promise<StopResult> {
  const details = await processDetails(pid);
  if (!details) return { ok: true, outcome: 'gone' };
  if (details.start !== start) {
    return {
      ok: false,
      outcome: 'replaced',
      error: 'That process has ended, and its id now belongs to another.',
    };
  }
  if (details.locked) {
    return { ok: false, outcome: 'locked', error: details.locked };
  }

  // Gone, or ended and only waiting to be cleared away, counts as stopped
  const { exitCode, stderr } = await hostScript(
    { signals: true },
    `pid=$1; want=$2; signal=$3
ended() {
  s=$(cat /proc/$pid/stat 2>/dev/null) || return 0
  set -- \${s##*) }
  [ "$1" = Z ]
}
ended && exit ${GONE}
s=$(cat /proc/$pid/stat) || exit ${GONE}
set -- \${s##*) }
[ "\${20}" = "$want" ] || exit ${REPLACED}
kill -$signal $pid || exit 1
i=0
while [ $i -lt ${WAIT_STEPS} ]; do
  ended && exit 0
  sleep ${WAIT_STEP_SECONDS}
  i=$((i + 1))
done
exit ${STILL_RUNNING}`,
    String(pid),
    String(start),
    force ? 'KILL' : 'TERM'
  );
  switch (exitCode) {
    case 0:
      return { ok: true, outcome: 'stopped' };
    case GONE:
      return { ok: true, outcome: 'gone' };
    case REPLACED:
      return {
        ok: false,
        outcome: 'replaced',
        error: 'That process has ended, and its id now belongs to another.',
      };
    case STILL_RUNNING:
      return {
        ok: false,
        outcome: 'running',
        error: force
          ? 'It’s still there: it may be waiting on the disk, which even a forced stop has to wait for.'
          : 'It’s still running: it may be finishing up, or ignoring the request.',
      };
    default:
      return {
        ok: false,
        outcome: 'failed',
        error: stderr || `Couldn't stop ${pid}`,
      };
  }
}
