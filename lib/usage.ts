import 'server-only';

import { containerUsage, listContainers, type Usage } from '@/lib/docker';

/** How often running containers are measured while someone is watching. */
const INTERVAL_MS = 5_000;
/** Readings kept per container: ten minutes at one every five seconds. */
const HISTORY = 120;
/** Measuring stops this long after the dashboard was last asked for usage. */
const IDLE_MS = 60_000;

type Sampler = {
  usage: Map<string, Usage & { history: number[] }>;
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

async function sample() {
  if (Date.now() - sampler.lastAsked > IDLE_MS) {
    clearInterval(sampler.timer);
    sampler.timer = undefined;
    return;
  }
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
        const history = [
          ...(sampler.usage.get(c.id)?.history ?? []),
          reading.cpu,
        ].slice(-HISTORY);
        sampler.usage.set(c.id, { ...reading, history });
      } catch {
        // Stopped between listing and measuring: it drops out next time
      }
    })
  );
}

/** The latest usage of each running container, by id, starting the sampler if needed. */
export async function currentUsage() {
  sampler.lastAsked = Date.now();
  if (!sampler.timer) {
    sampler.timer = setInterval(
      () => void sample().catch(console.error),
      INTERVAL_MS
    );
    if (!sampler.usage.size) await sample();
  }
  return sampler.usage;
}
