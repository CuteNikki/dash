import { CADDY_NETWORK } from '@/lib/stacks/new-service';

/**
 * A pasted `docker run` command as a compose file, as a new service's: its
 * service named after the stack, on Caddy's network as the templates' are.
 */
export type ConvertedRun = {
  compose: string;
  /** Its --name, or its image's, as a stack name */
  name: string;
  /** The first port it publishes, inside the container: Caddy's to send to */
  port: string;
  /** Flags that aren't carried over, to say so rather than drop them quietly */
  skipped: string[];
};

/** Words as a shell splits them: quotes kept together, line continuations joined. */
function words(command: string) {
  const out: string[] = [];
  let word = '';
  let started = false;
  let quote: '"' | "'" | undefined;
  const text = command.replace(/\\\r?\n/g, ' ');
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === quote) quote = undefined;
      else if (c === '\\' && quote === '"' && i + 1 < text.length)
        word += text[++i];
      else word += c;
    } else if (c === '"' || c === "'") {
      quote = c;
      started = true;
    } else if (c === '\\' && i + 1 < text.length) {
      word += text[++i];
      started = true;
    } else if (/\s/.test(c)) {
      if (started) out.push(word);
      word = '';
      started = false;
    } else {
      word += c;
      started = true;
    }
  }
  if (started) out.push(word);
  return out;
}

/** Flags that take a value, by their long name, with their short ones. */
const VALUED: Record<string, string> = {
  '-p': '--publish',
  '-v': '--volume',
  '-e': '--env',
  '-w': '--workdir',
  '-u': '--user',
  '-h': '--hostname',
  '-l': '--label',
  '--net': '--network',
};
const TAKES_VALUE = new Set([
  ...Object.values(VALUED),
  '--name',
  '--restart',
  '--env-file',
  '--entrypoint',
  '--cap-add',
  '--cap-drop',
  '--device',
  '--shm-size',
  '--add-host',
  '--memory',
  '-m',
  '--cpus',
  '--platform',
  '--pull',
  '--dns',
  '--tmpfs',
  '--mount',
  '--security-opt',
  '--ulimit',
  '--sysctl',
  '--log-driver',
  '--log-opt',
  '--stop-signal',
  '--health-cmd',
]);
/** Flags that only matter to a run by hand, which Compose does itself. */
const IGNORED = new Set([
  '-d',
  '--detach',
  '-i',
  '--interactive',
  '-t',
  '--tty',
  '--rm',
  '--init',
]);
/**
 * docker run's flags that take no value. Any other it doesn't know is taken
 * to have one, as nearly all of them do, so its value isn't read as the image.
 */
const SWITCHES = new Set([
  '--privileged',
  '--read-only',
  '-P',
  '--publish-all',
  '--no-healthcheck',
  '--oom-kill-disable',
  '--sig-proxy',
  '--disable-content-trust',
  '-q',
  '--quiet',
  '--use-api-socket',
]);

/** docker run's one-letter flags that take no value, which can be run together. */
const SHORT_SWITCHES = new Set(['d', 'i', 't', 'P', 'q']);

/**
 * One-letter flags run together, as -dit, as the ones they are, the last of
 * which may take a value, as in -dp 8080:80. Anything else is left as it is.
 */
function separate(word: string) {
  if (!/^-[a-zA-Z]{2,}$/.test(word)) return [word];
  const flags = [...word.slice(1)].map((letter) => `-${letter}`);
  const known = flags.every(
    (flag, i) =>
      SHORT_SWITCHES.has(flag.slice(1)) ||
      (i === flags.length - 1 && TAKES_VALUE.has(VALUED[flag] ?? flag))
  );
  return known ? flags : [word];
}

const quoted = (s: string) => JSON.stringify(s);
const list = (key: string, items: string[], indent = '    ') =>
  items.length
    ? `${indent}${key}:\n${items.map((i) => `${indent}  - ${i}`).join('\n')}\n`
    : '';

/** As Compose takes a project name. */
const stackName = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/^[^a-z0-9]+/, '');

export function convertRun(command: string): ConvertedRun {
  let all = words(command.trim());
  // Whatever comes before `run`: docker, sudo docker, podman, `docker container`
  const at = all.findIndex((w) => w === 'run');
  if (at < 0) throw new Error("That isn't a docker run command");
  all = all.slice(at + 1);

  const values: Record<string, string[]> = {};
  const flags = new Set<string>();
  const skipped: string[] = [];
  let i = 0;
  for (; i < all.length && all[i].startsWith('-'); i++) {
    all.splice(i, 1, ...separate(all[i]));
    // --name=app as well as --name app; the value may have an = of its own
    const equals = all[i].indexOf('=');
    let flag = equals < 0 ? all[i] : all[i].slice(0, equals);
    let value = equals < 0 ? undefined : all[i].slice(equals + 1);
    flag = VALUED[flag] ?? flag;
    if (IGNORED.has(flag)) continue;
    if (TAKES_VALUE.has(flag)) {
      value ??= all[++i];
      if (value === undefined) break;
      (values[flag] ??= []).push(value);
    } else if (flag === '--privileged' || flag === '--read-only') {
      flags.add(flag);
    } else if (SWITCHES.has(flag) || value !== undefined) {
      skipped.push(all[i]);
    } else {
      // One it doesn't know, with its value, which isn't the image
      const next = all[i + 1];
      skipped.push(next === undefined ? flag : `${flag} ${next}`);
      i++;
    }
  }
  const image = all[i];
  if (!image) throw new Error('It has no image to run');
  const args = all.slice(i + 1);

  const one = (flag: string) => values[flag]?.at(-1);
  const name = stackName(
    one('--name') ?? image.split('/').at(-1)!.split(/[:@]/)[0]
  );
  const published = values['--publish'] ?? [];
  // The container's side of the first: 8080:80/tcp → 80
  const port =
    published[0]?.split('/')[0].split(':').at(-1)?.replace(/-.*$/, '') ?? '';

  const networks = values['--network'] ?? [];
  const hostNetwork = networks.includes('host');
  const extraNetworks = networks.filter(
    (n) => n !== 'host' && n !== 'bridge' && n !== CADDY_NETWORK
  );
  const volumes = values['--volume'] ?? [];
  const named = volumes
    .map((v) => v.split(':')[0])
    .filter(
      (source) => source && !/^[./~]/.test(source) && !source.includes('/')
    );

  const keyed: [string, string | undefined][] = [
    ['entrypoint', one('--entrypoint')],
    ['working_dir', one('--workdir')],
    ['user', one('--user')],
    ['hostname', one('--hostname')],
    ['shm_size', one('--shm-size')],
    ['mem_limit', one('--memory') ?? one('-m')],
    ['cpus', one('--cpus')],
    ['platform', one('--platform')],
    ['pull_policy', one('--pull')],
    ['stop_signal', one('--stop-signal')],
  ];
  for (const flag of [
    '--mount',
    '--security-opt',
    '--ulimit',
    '--sysctl',
    '--log-driver',
    '--log-opt',
    '--health-cmd',
    '--tmpfs',
    '--dns',
  ]) {
    for (const v of values[flag] ?? []) skipped.push(`${flag} ${v}`);
  }

  let yaml = `services:\n  ${name}:\n    image: ${image}\n    container_name: ${name}\n    restart: ${one('--restart') ?? 'unless-stopped'}\n`;
  for (const [key, value] of keyed) {
    if (value !== undefined) yaml += `    ${key}: ${quoted(value)}\n`;
  }
  if (args.length) yaml += `    command: ${JSON.stringify(args)}\n`;
  if (flags.has('--privileged')) yaml += '    privileged: true\n';
  if (flags.has('--read-only')) yaml += '    read_only: true\n';
  yaml += list('environment', (values['--env'] ?? []).map(quoted));
  yaml += list('env_file', (values['--env-file'] ?? []).map(quoted));
  yaml += list('ports', published.map(quoted));
  yaml += list('volumes', volumes.map(quoted));
  yaml += list('cap_add', values['--cap-add'] ?? []);
  yaml += list('cap_drop', values['--cap-drop'] ?? []);
  yaml += list('devices', (values['--device'] ?? []).map(quoted));
  yaml += list('extra_hosts', (values['--add-host'] ?? []).map(quoted));
  yaml += list('labels', (values['--label'] ?? []).map(quoted));
  // On the host's own network it can't join Caddy's; Caddy finds it by port
  if (hostNetwork) yaml += '    network_mode: host\n';
  else yaml += list('networks', [CADDY_NETWORK, ...extraNetworks]);

  if (!hostNetwork) {
    yaml += `\nnetworks:\n  ${CADDY_NETWORK}:\n    external: true\n`;
    for (const n of extraNetworks) yaml += `  ${n}:\n    external: true\n`;
  }
  if (named.length) {
    yaml += `\nvolumes:\n${[...new Set(named)].map((v) => `  ${v}:`).join('\n')}\n`;
  }
  return { compose: yaml, name, port, skipped };
}
