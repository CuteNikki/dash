import 'server-only';

import {
  containerUsage,
  dockerInfo,
  listContainers,
  type Usage,
} from '@/lib/docker';
import { readHost, type HostReading } from '@/lib/host';
import type { HostStats } from '@/lib/types';

/** How often the server and its containers are measured while someone is watching. */
const INTERVAL_MS = 5_000;
/** Readings kept for each graph: ten minutes at one every five seconds. */
const HISTORY = 120;
/** Measuring stops this long after the dashboard was last asked for usage. */
const IDLE_MS = 60_000;

type Sampler = {
  usage: Map<string, Usage & { history: number[] }>;
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
        const history = recent(sampler.usage.get(c.id)?.history, reading.cpu);
        sampler.usage.set(c.id, { ...reading, history });
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
  const ticks = now.cpu.total - last.cpu.total;
  const cpu = ticks > 0 ? ((now.cpu.busy - last.cpu.busy) / ticks) * 100 : 0;
  const received =
    Math.max(0, now.network.received - last.network.received) / seconds;
  const sent = Math.max(0, now.network.sent - last.network.sent) / seconds;
  const history = sampler.host?.history;
  sampler.host = {
    cores: now.cores,
    cpu,
    memory: now.memory,
    disk: now.disk,
    network: { received, sent },
    system: {
      ...info,
      cpuModel: now.cpuModel,
      uptime: now.uptime,
      load: now.load,
      swap: now.swap,
    },
    history: {
      cpu: recent(history?.cpu, cpu),
      memory: recent(history?.memory, now.memory.used),
      received: recent(history?.received, received),
      sent: recent(history?.sent, sent),
    },
  };
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
