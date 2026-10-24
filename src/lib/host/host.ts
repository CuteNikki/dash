import 'server-only';

import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { promisify } from 'node:util';

import { execOutput } from '@/lib/docker/docker';
import type { Capacity } from '@/lib/types';

/**
 * The server's own counters, from the kernel. In the dashboard's container
 * (run with the host's process namespace) they're read directly; in
 * development, through a small helper container on the server that shares
 * it, named by HOST_HELPER_CONTAINER.
 */
const HELPER = process.env.HOST_HELPER_CONTAINER;

/** How much of a process's command is kept, enough to tell what it is. */
const COMMAND_BYTES = 256;

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
  // The memory installed: its block size in hex, then a 1 for each block online
  memoryBlocks:
    'cat /sys/devices/system/memory/block_size_bytes /sys/devices/system/memory/memory*/online 2>/dev/null',
  // The whole disk the root filesystem is on, in 512-byte sectors: from the
  // root mount's device to its disk, stepping up from a partition
  diskSize: `dev=$(awk '$5 == "/" { print $3; exit }' /proc/1/mountinfo)
p=$(readlink -f "/sys/dev/block/$dev"); [ -f "$p/partition" ] && p=\${p%/*}
cat "$p/size" 2>/dev/null`,
  processes: 'cat /proc/[0-9]*/stat 2>/dev/null',
  // Kernel threads have no memory of their own, so no line
  processMemory: "grep -H '^VmRSS:' /proc/[0-9]*/status 2>/dev/null",
  // The container a process runs in, by the id in its control group's name
  processContainers:
    "grep -H -E -o 'docker[-/][0-9a-f]{64}' /proc/[0-9]*/cgroup 2>/dev/null",
  // How each was started, its arguments split by NULs made spaces, under a
  // "==> /tmp/…/$id/123/cmdline <==" heading each; enough to tell it apart.
  // Through a link named for this run, as any process can put "==>
  // /proc/1/cmdline <==" in its own arguments, but not this run's id
  processCommands: `d=$(mktemp -d) && { ln -s /proc "$d/$id" && head -c ${COMMAND_BYTES} "$d/$id"/[0-9]*/cmdline 2>/dev/null | tr '\\0' ' '; rm -f "$d/$id"; rmdir "$d"; }`,
} as const;

type Raw = Record<keyof typeof SOURCES, string>;

/** Room for every process's line, which a busy server has hundreds of. */
const MAX_OUTPUT_BYTES = 16 * 1024 * 1024;

/**
 * Everything in one run of the shell, each part's output split by a marker.
 * Both are new each run, as a process can name itself anything: one that put
 * the marker in its name or arguments would otherwise shift every part after.
 */
async function readRaw(): Promise<Raw & { id: string }> {
  const names = Object.keys(SOURCES) as (keyof typeof SOURCES)[];
  const id = randomUUID();
  const marker = `--dash-${id}--`;
  const script = `id=${id}; ${names.map((n) => SOURCES[n]).join(`; echo ${marker}; `)}; true`;
  const output = HELPER
    ? await execOutput(HELPER, ['sh', '-c', script])
    : (
        await promisify(execFile)('sh', ['-c', script], {
          maxBuffer: MAX_OUTPUT_BYTES,
        })
      ).stdout;
  const parts = output.split(`${marker}\n`);
  return {
    ...(Object.fromEntries(names.map((n, i) => [n, parts[i] ?? ''])) as Raw),
    id,
  };
}

export type HostReading = {
  /** When it was read, for working out rates between two readings */
  at: number;
  /** All cores' CPU time together */
  cpu: CpuTime;
  /** The same for each core, in order */
  coreCpu: CpuTime[];
  cores: number;
  memory: Capacity;
  /** Of the disk the root filesystem is on */
  disk: Capacity;
  /**
   * Bytes read from and written to the server's disks since boot, how many
   * reads and writes that was, and the milliseconds they took together
   */
  diskIo: { read: number; written: number; ops: number; waitMs: number };
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
  /** How it was started, its arguments split by spaces; empty for the kernel's own */
  command: string;
  /** The full id of the container it runs in, if it does */
  containerId?: string;
};

/** The kernel counts disks in sectors of this many bytes, whatever the disk's own. */
const SECTOR_BYTES = 512;
/** Whole disks, not their partitions, nor loop, RAM or mapped devices */
const WHOLE_DISK = /^(sd[a-z]+|vd[a-z]+|xvd[a-z]+|nvme\d+n\d+|mmcblk\d+)$/;

function parseDiskIo(diskstats: string) {
  // major minor name reads merged sectors-read ms-reading writes merged
  // sectors-written ms-writing …
  let read = 0;
  let written = 0;
  let ops = 0;
  let waitMs = 0;
  for (const line of diskstats.split('\n')) {
    const cols = line.trim().split(/\s+/);
    if (!WHOLE_DISK.test(cols[2] ?? '')) continue;
    read += Number(cols[5]) * SECTOR_BYTES;
    written += Number(cols[9]) * SECTOR_BYTES;
    ops += Number(cols[3]) + Number(cols[7]);
    waitMs += Number(cols[6]) + Number(cols[10]);
  }
  return { read, written, ops, waitMs };
}

function parseProcesses(raw: Raw, id: string) {
  const memory = new Map<number, number>();
  for (const line of raw.processMemory.split('\n')) {
    // /proc/123/status:VmRSS:     4567 kB
    const match = line.match(/^\/proc\/(\d+)\/status:VmRSS:\s+(\d+) kB/);
    if (match) memory.set(Number(match[1]), Number(match[2]) * 1024);
  }
  const containers = new Map<number, string>();
  for (const line of raw.processContainers.split('\n')) {
    // /proc/123/cgroup:docker-<id>, or docker/<id> with older setups
    const match = line.match(/^\/proc\/(\d+)\/cgroup:docker[-/]([0-9a-f]+)/);
    if (match) containers.set(Number(match[1]), match[2]);
  }
  const commands = new Map<number, string>();
  // The heading's pid, then the command up to the next heading
  const parts = raw.processCommands.split(
    new RegExp(`(?:^|\\n)==> [^\\n]*/${id}/(\\d+)/cmdline <==\\n`)
  );
  for (let i = 1; i < parts.length; i += 2) {
    commands.set(Number(parts[i]), (parts[i + 1] ?? '').trim());
  }
  const processes = new Map<number, ProcessReading>();
  for (const line of raw.processes.split('\n')) {
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
      command: commands.get(pid) ?? '',
      containerId: containers.get(pid),
    });
  }
  return processes;
}

/**
 * CPU time, the part of it spent busy, and the part of that taken by other
 * machines on the same host (steal), in clock ticks
 */
export type CpuTime = { busy: number; total: number; steal: number };

/** cpu  user nice system idle iowait irq softirq steal …, for all or one core */
function cpuTime(line: string): CpuTime {
  const fields = line.trim().split(/\s+/).slice(1).map(Number);
  const total = fields.reduce((a, b) => a + b, 0);
  const idle = fields[3] + (fields[4] ?? 0);
  return { busy: total - idle, total, steal: fields[7] ?? 0 };
}

function parseCpu(stat: string) {
  const lines = stat.split('\n');
  // The first line is all of them together, then cpu0, cpu1, …
  const coreCpu = lines.filter((l) => /^cpu\d+ /.test(l)).map(cpuTime);
  return { cpu: cpuTime(lines[0]), coreCpu, cores: coreCpu.length };
}

function parseMemory(meminfo: string, blocks: string) {
  const kb = (key: string) =>
    Number(meminfo.match(new RegExp(`^${key}:\\s+(\\d+)`, 'm'))?.[1] ?? 0) *
    1024;
  const total = kb('MemTotal');
  const swap = kb('SwapTotal');
  // The block size in hex, then a 1 for each block that's online; a server
  // that doesn't list its memory that way shows what's usable as its size
  const [blockSize, ...online] = blocks.trim().split('\n');
  const installed =
    parseInt(blockSize, 16) * online.filter((b) => b.trim() === '1').length;
  return {
    memory: {
      // Used as the kernel counts it: what isn't available to programs
      used: total - kb('MemAvailable'),
      total,
      size: Math.max(installed || 0, total),
    },
    swap: { used: swap - kb('SwapFree'), total: swap },
  };
}

function parseDisk(df: string, sectors: string) {
  // Filesystem 1024-blocks Used Available Capacity Mounted on
  const [, blocks, used] = df.trim().split('\n').at(-1)!.split(/\s+/);
  const total = Number(blocks) * 1024;
  return {
    used: Number(used) * 1024,
    total,
    size: Math.max(Number(sectors.trim()) * SECTOR_BYTES || 0, total),
  };
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
    ...parseMemory(raw.memory, raw.memoryBlocks),
    cpuModel:
      raw.cpuinfo.match(/^model name\s*:\s*(.+)$/m)?.[1].trim() ?? 'Unknown',
    uptime: Number(raw.uptime.split(/\s+/)[0]),
    load: raw.load.split(/\s+/).slice(0, 3).map(Number) as [
      number,
      number,
      number,
    ],
    disk: parseDisk(raw.disk, raw.diskSize),
    diskIo: parseDiskIo(raw.disks),
    processes: parseProcesses(raw, raw.id),
    network: parseNetwork(raw.network, raw.routes),
  };
}
