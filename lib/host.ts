import 'server-only';

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { execOutput } from '@/lib/docker';

/**
 * The server's own counters, from the kernel. In the dashboard's container
 * (run with the host's process namespace) they're read directly; in
 * development, through a small helper container on the server that shares
 * it, named by HOST_HELPER_CONTAINER.
 */
const HELPER = process.env.HOST_HELPER_CONTAINER;

/**
 * What's read, each by a shell command. Process 1 is the server's own init,
 * so its network is the server's. A process can end between being listed
 * and being read, so those reads skip what's gone.
 */
const SOURCES = {
  cpu: 'cat /proc/stat',
  memory: 'cat /proc/meminfo',
  network: 'cat /proc/1/net/dev',
  routes: 'cat /proc/1/net/route',
  cpuinfo: 'cat /proc/cpuinfo',
  uptime: 'cat /proc/uptime',
  load: 'cat /proc/loadavg',
  disks: 'cat /proc/diskstats',
  disk: 'df -kP /',
  processes: 'cat /proc/[0-9]*/stat 2>/dev/null',
  // Kernel threads have no memory of their own, so no line
  processMemory: "grep -H '^VmRSS:' /proc/[0-9]*/status 2>/dev/null",
} as const;

type Raw = Record<keyof typeof SOURCES, string>;

/** Room for every process's line, which a busy server has hundreds of. */
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

/** Everything in one run of the shell, each part's output split by a marker. */
async function readRaw(): Promise<Raw> {
  const names = Object.keys(SOURCES) as (keyof typeof SOURCES)[];
  const marker = '--dash--';
  const script = `${names.map((n) => SOURCES[n]).join(`; echo ${marker}; `)}; true`;
  const output = HELPER
    ? await execOutput(HELPER, ['sh', '-c', script])
    : (
        await promisify(execFile)('sh', ['-c', script], {
          maxBuffer: MAX_OUTPUT_BYTES,
        })
      ).stdout;
  const parts = output.split(`${marker}\n`);
  return Object.fromEntries(names.map((n, i) => [n, parts[i] ?? ''])) as Raw;
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
  /** Bytes read from and written to the server's disks since boot */
  diskIo: { read: number; written: number };
  /** Every process, by its id */
  processes: Map<number, ProcessReading>;
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

export type ProcessReading = {
  /** Its command's name, as the kernel keeps it: at most 15 characters */
  name: string;
  /** CPU time it's used since it started, in clock ticks */
  ticks: number;
  /** Bytes of memory it holds */
  memory: number;
};

/** The kernel counts disk traffic in sectors of this many bytes, whatever the disk's own. */
const SECTOR_BYTES = 512;
/** Whole disks, not their partitions, nor loop, RAM or mapped devices */
const WHOLE_DISK = /^(sd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme\d+n\d+|mmcblk\d+)$/;

function parseDiskIo(diskstats: string) {
  // major minor name reads merged sectors-read ms writes merged sectors-written …
  let read = 0;
  let written = 0;
  for (const line of diskstats.split('\n')) {
    const cols = line.trim().split(/\s+/);
    if (!WHOLE_DISK.test(cols[2] ?? '')) continue;
    read += Number(cols[5]) * SECTOR_BYTES;
    written += Number(cols[9]) * SECTOR_BYTES;
  }
  return { read, written };
}

function parseProcesses(stats: string, statuses: string) {
  const memory = new Map<number, number>();
  for (const line of statuses.split('\n')) {
    // /proc/123/status:VmRSS:     4567 kB
    const match = line.match(/^\/proc\/(\d+)\/status:VmRSS:\s+(\d+) kB/);
    if (match) memory.set(Number(match[1]), Number(match[2]) * 1024);
  }
  const processes = new Map<number, ProcessReading>();
  for (const line of stats.split('\n')) {
    // pid (name) state …; the name can hold spaces and brackets of its own,
    // so it runs to the last closing one
    const open = line.indexOf('(');
    const close = line.lastIndexOf(')');
    if (open < 0 || close < open) continue;
    const pid = Number(line.slice(0, open));
    const fields = line.slice(close + 2).split(' ');
    // Counting from the state: user and system time are the 12th and 13th
    processes.set(pid, {
      name: line.slice(open + 1, close),
      ticks: Number(fields[11]) + Number(fields[12]),
      memory: memory.get(pid) ?? 0,
    });
  }
  return processes;
}

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
    diskIo: parseDiskIo(raw.disks),
    processes: parseProcesses(raw.processes, raw.processMemory),
    network: parseNetwork(raw.network, raw.routes),
  };
}
