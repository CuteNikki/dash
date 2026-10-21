import 'server-only';

import {
  containerUsage,
  dockerInfo,
  listContainers,
  type Usage,
} from '@/lib/docker';
import { readHost, type CpuTime, type HostReading } from '@/lib/host';
import type { HostProcess, HostStats, UsageHistory } from '@/lib/types';

/** How often the server and its containers are measured while someone is watching. */
const INTERVAL_MS = 5_000;
/** Readings kept for each graph: ten minutes at one every five seconds. */
const HISTORY = 120;
/** Measuring stops this long after the dashboard was last asked for usage. */
const IDLE_MS = 60_000;

type Sampler = {
  usage: Map<string, Usage & { history: UsageHistory }>;
  host?: HostStats;
  /** The last reading of the server's counters, to measure the next against */
  lastHost?: HostReading;
  timer?: NodeJS.Timeout;
  /** The copy of this module whose timer runs, see below */
  owner?: symbol;
  lastAsked: number;
};

// Kept on globalThis so development's hot reloads keep the readings and don't
// start a second timer. A reload replaces this module, so its timer is
// restarted with the new code rather than left running the old.
const MODULE = Symbol('usage');
const sampler: Sampler = ((
  globalThis as typeof globalThis & { usageSampler?: Sampler }
).usageSampler ??= { usage: new Map(), lastAsked: 0 });
if (sampler.owner !== MODULE) {
  clearInterval(sampler.timer);
  sampler.timer = undefined;
  sampler.owner = MODULE;
}

const recent = (history: number[] | undefined, value: number) =>
  [...(history ?? []), value].slice(-HISTORY);

async function sampleContainers() {
  const running = (await listContainers()).filter((c) =>
    ['running', 'unhealthy', 'starting'].includes(c.state)
  );
  const ids = new Set(running.map((c) => c.id));
  for (const id of sampler.usage.keys()) {
    if (!ids.has(id)) sampler.usage.delete(id);
  }
  await Promise.all(
    running.map(async (c) => {
      try {
        const reading = await containerUsage(c.id);
        const last = sampler.usage.get(c.id)?.history;
        sampler.usage.set(c.id, {
          ...reading,
          history: {
            at: recent(last?.at, Date.now()),
            cpu: recent(last?.cpu, reading.cpu),
            memory: recent(last?.memory, reading.memory),
          },
        });
      } catch {
        // Stopped between listing and measuring: it drops out next time
      }
    })
  );
}

/** CPU and network are rates, so the first reading only sets a starting point. */
async function sampleHost() {
  const [now, info] = await Promise.all([readHost(), dockerInfo()]);
  const last = sampler.lastHost;
  sampler.lastHost = now;
  if (!last) return;
  const seconds = (now.at - last.at) / 1000;
  const share = (from: CpuTime | undefined, to: CpuTime) => {
    const ticks = to.total - (from?.total ?? 0);
    return from && ticks > 0 ? ((to.busy - from.busy) / ticks) * 100 : 0;
  };
  const ticks = now.cpu.total - last.cpu.total;
  const cpu = share(last.cpu, now.cpu);
  const coreCpu = now.coreCpu.map((c, i) => share(last.coreCpu[i], c));
  const rate = (from: number, to: number) => Math.max(0, to - from) / seconds;
  const received = rate(last.network.received, now.network.received);
  const sent = rate(last.network.sent, now.network.sent);
  const diskIo = {
    read: rate(last.diskIo.read, now.diskIo.read),
    written: rate(last.diskIo.written, now.diskIo.written),
  };
  const history = sampler.host?.history;
  sampler.host = {
    cores: now.cores,
    cpu,
    coreCpu,
    memory: now.memory,
    disk: now.disk,
    network: { received, sent },
    diskIo,
    processes: busiest(last, now, ticks / now.cores),
    system: {
      ...info,
      cpuModel: now.cpuModel,
      uptime: now.uptime,
      load: now.load,
      swap: now.swap,
    },
    history: {
      at: recent(history?.at, now.at),
      cpu: recent(history?.cpu, cpu),
      coreCpu: coreCpu.map((c, i) => recent(history?.coreCpu?.[i], c)),
      memory: recent(history?.memory, now.memory.used),
      received: recent(history?.received, received),
      sent: recent(history?.sent, sent),
      diskRead: recent(history?.diskRead, diskIo.read),
      diskWritten: recent(history?.diskWritten, diskIo.written),
    },
  };
}

/**
 * The server's processes, busiest first, with the CPU each used between two
 * readings. `coreTicks` is one core's clock ticks in that time, for a share
 * of one core, as for containers. A process seen only once has no time to
 * measure yet, and the kernel's own threads only count while they're busy.
 */
function busiest(
  last: HostReading,
  now: HostReading,
  coreTicks: number
): HostProcess[] {
  if (coreTicks <= 0) return [];
  const measured: HostProcess[] = [];
  for (const [pid, p] of now.processes) {
    const before = last.processes.get(pid);
    // An id given to a new process since is a different program
    if (!before || before.name !== p.name || before.ticks > p.ticks) continue;
    const cpu = ((p.ticks - before.ticks) / coreTicks) * 100;
    if (!p.memory && !cpu) continue;
    measured.push({
      pid,
      name: p.name,
      command: p.command,
      containerId: p.containerId,
      cpu,
      memory: p.memory,
    });
  }
  return measured.sort((a, b) => b.cpu - a.cpu || b.memory - a.memory);
}

async function sample() {
  if (Date.now() - sampler.lastAsked > IDLE_MS) {
    clearInterval(sampler.timer);
    sampler.timer = undefined;
    sampler.lastHost = undefined;
    return;
  }
  await Promise.all([
    sampleContainers(),
    // Without access to the server's counters, there's just no server stats
    sampleHost().catch(() => undefined),
  ]);
}

/** The latest readings, starting the sampler if needed. */
export async function currentUsage() {
  sampler.lastAsked = Date.now();
  if (!sampler.timer) {
    sampler.timer = setInterval(
      () => void sample().catch(console.error),
      INTERVAL_MS
    );
    if (!sampler.usage.size) await sample();
  }
  return { containers: sampler.usage, host: sampler.host };
}
