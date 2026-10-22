import 'server-only';

import { runContainer, runToEnd, type Run } from '@/lib/docker/runner';
import type { SystemUpdates } from '@/lib/types';

/**
 * The server's own updates, Ubuntu's packages: which are waiting, installing
 * them, and restarting the server once they ask for it. Everything runs as
 * the server itself, in a short-lived container that enters it.
 */

const IMAGE = 'alpine:3.22';

/** The systemd job the upgrade runs as, which outlives Docker restarting midway, as upgrading Docker does. */
const UNIT = 'dash-system-upgrade';
/** When the last upgrade started, and how it ended: kept where systemd's job can write them. */
const STARTED = `/run/${UNIT}.started`;
const STATUS = `/run/${UNIT}.status`;

/** How long what was found is trusted, as each look starts a privileged container. */
const FRESH_MS = 10 * 60_000;

/** A command run as the server, as root, with its own tools to hand. */
function asHost(script: string): Run {
  return {
    image: IMAGE,
    cmd: [
      'nsenter',
      '-t',
      '1',
      '-m',
      '-u',
      '-i',
      '-n',
      '-p',
      '--',
      '/bin/sh',
      '-c',
      `export PATH=/usr/sbin:/usr/bin:/sbin:/bin LC_ALL=C; ${script}`,
    ],
    workingDir: '/',
    asHost: true,
  };
}

/** What a look prints: key=value lines, a package's as pkg=<apt list's line>. */
const LOOK = `
. /etc/os-release; echo "os=$PRETTY_NAME"
[ -e /var/run/reboot-required ] && echo reboot=1
[ -e /var/run/reboot-required.pkgs ] && sed 's/^/rebootfor=/' /var/run/reboot-required.pkgs
stamp=/var/lib/apt/periodic/update-success-stamp
[ -e $stamp ] || stamp=/var/lib/apt/lists
echo "refreshed=$(stat -c %Y $stamp)"
systemctl is-active -q ${UNIT} && echo upgrading=1
[ -e ${STATUS} ] && echo "lastexit=$(cat ${STATUS})"
systemctl list-units --failed --plain --no-legend | awk '{print "failed="$1}'
apt list --upgradable 2>/dev/null | grep upgradable | sed 's/^/pkg=/'
true`;

/** "systemd/resolute-updates,resolute-security 259.9-0ubuntu0.1 amd64 [upgradable from: 259.5-0ubuntu3.4]" */
const PACKAGE =
  /^([^/\s]+)\/(\S+)\s+(\S+)\s+\S+\s+\[upgradable from: ([^\]]+)\]/;

function parse(lines: string[]): SystemUpdates {
  const found: SystemUpdates = {
    os: '',
    packages: [],
    reboot: false,
    rebootFor: [],
    failedUnits: [],
    upgrading: false,
    checkedAt: Date.now(),
  };
  for (const line of lines) {
    const eq = line.indexOf('=');
    const key = line.slice(0, eq);
    const value = line.slice(eq + 1);
    if (key === 'os') found.os = value;
    else if (key === 'reboot') found.reboot = true;
    else if (key === 'rebootfor') found.rebootFor.push(value);
    else if (key === 'refreshed') found.refreshedAt = Number(value) * 1000;
    else if (key === 'upgrading') found.upgrading = true;
    else if (key === 'lastexit') found.lastExit = Number(value);
    else if (key === 'failed') found.failedUnits.push(value);
    else if (key === 'pkg') {
      const match = value.match(PACKAGE);
      if (!match) continue;
      const [, name, origins, to, from] = match;
      found.packages.push({
        name,
        from,
        to,
        security: origins.split(',').some((o) => o.endsWith('-security')),
      });
    }
  }
  found.packages.sort(
    (a, b) =>
      Number(b.security) - Number(a.security) || a.name.localeCompare(b.name)
  );
  return found;
}

type Cache = { found?: SystemUpdates; looking?: Promise<SystemUpdates> };
// Kept on globalThis, so development's hot reloads keep it
const cache: Cache = ((
  globalThis as typeof globalThis & { systemUpdates?: Cache }
).systemUpdates ??= {});

async function look() {
  const { ok, lines } = await runToEnd(asHost(LOOK));
  if (!ok) throw new Error(lines.map((l) => l.line).join('\n'));
  return parse(lines.map((l) => l.line));
}

/** Looks again now, and waits for it. */
export function lookAgain() {
  cache.looking ??= look()
    .then((found) => (cache.found = found))
    .finally(() => {
      cache.looking = undefined;
    });
  return cache.looking;
}

/**
 * What was last found, looking again in the background once it's old, so
 * the dashboard never waits on it. Nothing until the first look is done.
 */
export function currentSystemUpdates() {
  const found = cache.found;
  if (!found || Date.now() - found.checkedAt > FRESH_MS) {
    void lookAgain().catch(console.error);
  }
  return found;
}

/** Starts the upgrade as a systemd job on the server, unless one is running. */
export async function startUpgrade() {
  const { ok, lines } = await runToEnd(
    asHost(`
systemctl is-active -q ${UNIT} && { echo "An upgrade is already running" >&2; exit 1; }
date +%s > ${STARTED}; rm -f ${STATUS}
systemd-run --unit=${UNIT} --description="System upgrade from dash" --collect \\
  --setenv=DEBIAN_FRONTEND=noninteractive /bin/sh -c '
apt-get update && apt-get -y --with-new-pkgs \\
  -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold upgrade
echo $? > ${STATUS}'`)
  );
  if (!ok) throw new Error(lines.map((l) => l.line).join('\n'));
}

/**
 * The running or last upgrade's output, from its start, following it until
 * it's done; exits as it did. Followed again from the start after a break,
 * as when Docker restarts partway.
 */
export async function* followUpgrade() {
  const exit = yield* runContainer(
    asHost(`
since=$(cat ${STARTED} 2>/dev/null || echo 0)
journalctl -u ${UNIT} -o cat --no-pager --since "@$since" -n all -f & j=$!
while systemctl is-active -q ${UNIT}; do sleep 1; done
sleep 1; kill $j 2>/dev/null
exit $(cat ${STATUS} 2>/dev/null || echo 1)`)
  );
  void lookAgain().catch(console.error);
  return exit;
}

/** Restarts the server in a few seconds, so this answer gets out first. */
export async function scheduleReboot() {
  const { ok, lines } = await runToEnd(
    asHost(
      `systemd-run --unit=dash-reboot --collect --on-active=5 systemctl reboot`
    )
  );
  if (!ok) throw new Error(lines.map((l) => l.line).join('\n'));
}
