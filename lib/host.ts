import 'server-only';

import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { promisify } from 'node:util';

import { execOutput } from '@/lib/docker';

/**
 * The server's own counters, from the kernel. In the dashboard's container
 * (run with the host's process namespace) they're read directly; in
 * development, through a small helper container on the server that shares
 * it, named by HOST_HELPER_CONTAINER.
 */
const HELPER = process.env.HOST_HELPER_CONTAINER;

/** Process 1 is the server's own init, so its network is the server's. */
const FILES = {
  cpu: '/proc/stat',
  memory: '/proc/meminfo',
  network: '/proc/1/net/dev',
  routes: '/proc/1/net/route',
  cpuinfo: '/proc/cpuinfo',
  uptime: '/proc/uptime',
  load: '/proc/loadavg',
} as const;

type Raw = Record<keyof typeof FILES, string> & { disk: string };

async function readRaw(): Promise<Raw> {
  const names = Object.keys(FILES) as (keyof typeof FILES)[];
  if (HELPER) {
    // One exec for all of them, the files and df's line split by a marker
    const marker = '--dash--';
    const script = [...names.map((n) => `cat ${FILES[n]}`), 'df -kP /'].join(
      `; echo ${marker}; `
    );
    const parts = (await execOutput(HELPER, ['sh', '-c', script])).split(
      `${marker}\n`
    );
    return {
      ...Object.fromEntries(names.map((n, i) => [n, parts[i] ?? ''])),
      disk: parts[names.length] ?? '',
    } as Raw;
  }
  const files = await Promise.all(names.map((n) => readFile(FILES[n], 'utf8')));
  const { stdout } = await promisify(execFile)('df', ['-kP', '/']);
  return {
    ...Object.fromEntries(names.map((n, i) => [n, files[i]])),
    disk: stdout,
  } as Raw;
}

export type HostReading = {
  /** When it was read, for working out rates between two readings */
  at: number;
  /** Total CPU time and the part of it spent idle, in clock ticks */
  cpu: { busy: number; total: number };
  cores: number;
  /** Bytes */
  memory: { used: number; total: number };
  /** Bytes, of the disk the root filesystem is on */
  disk: { used: number; total: number };
  /** Bytes received and sent since boot, on the interface to the internet */
  network: { received: number; sent: number; interface: string };
  /** Bytes; a total of 0 is a server without swap */
  swap: { used: number; total: number };
  /** As the processor names itself; a virtual server's is often generic */
  cpuModel: string;
  /** Seconds since the server started */
  uptime: number;
  /** Processes waiting for the CPU, averaged over 1, 5 and 15 minutes */
  load: [number, number, number];
};

function parseCpu(stat: string) {
  // cpu  user nice system idle iowait irq softirq steal …
  const fields = stat.split('\n')[0].trim().split(/\s+/).slice(1).map(Number);
  const total = fields.reduce((a, b) => a + b, 0);
  const idle = fields[3] + (fields[4] ?? 0);
  const cores = stat.split('\n').filter((l) => /^cpu\d+ /.test(l)).length;
  return { cpu: { busy: total - idle, total }, cores };
}

function parseMemory(meminfo: string) {
  const kb = (key: string) =>
    Number(meminfo.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'))?.[1] ?? 0) *
    1024;
  const total = kb('MemTotal');
  const swap = kb('SwapTotal');
  return {
    // Used as the kernel counts it: what isn't available to programs
    memory: { used: total - kb('MemAvailable'), total },
    swap: { used: swap - kb('SwapFree'), total: swap },
  };
}

function parseDisk(df: string) {
  // Filesystem 1024-blocks Used Available Capacity Mounted on
  const [, size, used] = df.trim().split('\n').at(-1)!.split(/\s+/);
  return { used: Number(used) * 1024, total: Number(size) * 1024 };
}

function parseNetwork(dev: string, routes: string) {
  // The interface with the default route, 0.0.0.0, is the one to the
  // internet; the rest are Docker's bridges between containers
  const iface =
    routes
      .split('\n')
      .slice(1)
      .map((l) => l.trim().split(/\s+/))
      .find((cols) => cols[1] === '00000000')?.[0] ?? 'eth0';
  const line = dev.split('\n').find((l) => l.trim().startsWith(`${iface}:`));
  const cols = line?.split(':')[1].trim().split(/\s+/).map(Number) ?? [];
  // Received bytes come first, sent bytes ninth
  return { received: cols[0] ?? 0, sent: cols[8] ?? 0, interface: iface };
}

export async function readHost(): Promise<HostReading> {
  const raw = await readRaw();
  return {
    at: Date.now(),
    ...parseCpu(raw.cpu),
    ...parseMemory(raw.memory),
    cpuModel:
      raw.cpuinfo.match(/^model name\s*:\s*(.+)$/m)?.[1].trim() ?? 'Unknown',
    uptime: Number(raw.uptime.split(/\s+/)[0]),
    load: raw.load.split(/\s+/).slice(0, 3).map(Number) as [
      number,
      number,
      number,
    ],
    disk: parseDisk(raw.disk),
    network: parseNetwork(raw.network, raw.routes),
  };
}
