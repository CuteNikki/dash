import 'server-only';

import { once, run, stats, type App } from '@/lib/apps/app';
import { formatBytes } from '@/lib/format';

/** Garage's sizes, "216.7 kB (211.7 KiB)", in bytes: the one in powers of 1024 where there is one. */
function garageBytes(size: string) {
  const [, value, unit] =
    size.match(/\(([\d.]+) (\w+)\)/) ?? size.match(/([\d.]+) (\w+)/) ?? [];
  const power = ['B', 'KiB', 'MiB', 'GiB', 'TiB'].indexOf(unit);
  const si = ['B', 'kB', 'MB', 'GB', 'TB'].indexOf(unit);
  if (power < 0 && si < 0) throw new Error(`Unknown size: ${size}`);
  return power >= 0 ? +value * 1024 ** power : +value * 1000 ** si;
}

/** Garage, the image storage: what all its buckets hold together. */
export const garage: App = {
  read: async ({ container: c }) => {
    const ids = (await run(c, ['/garage', 'bucket', 'list']))
      .split('\n')
      .map((line) => line.match(/^([0-9a-f]{16})\s/)?.[1])
      .filter((id) => id !== undefined);
    const infos = once(() =>
      Promise.all(ids.map((id) => run(c, ['/garage', 'bucket', 'info', id])))
    );
    const total = async (field: string, parse: (s: string) => number) =>
      (await infos()).reduce((sum, info) => {
        const value = info.match(new RegExp(`^${field}:\\s*(.+)$`, 'm'))?.[1];
        if (!value) throw new Error(`No ${field} in its bucket info`);
        return sum + parse(value);
      }, 0);
    return stats([
      ['Objects', () => total('Objects', Number)],
      ['Used', async () => formatBytes(await total('Size', garageBytes))],
    ]);
  },
};
