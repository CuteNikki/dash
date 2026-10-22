import 'server-only';

import { run, type App } from '@/lib/apps/app';
import type { Container } from '@/lib/docker';
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

/** Each bucket: its name, the first of its global aliases or else its id, and what it holds. */
async function buckets(c: Container) {
  const ids = (await run(c, ['/garage', 'bucket', 'list']))
    .split('\n')
    .map((line) => line.match(/^([0-9a-f]{16})\s/)?.[1])
    .filter((id) => id !== undefined);
  return Promise.all(
    ids.map(async (id) => {
      const info = await run(c, ['/garage', 'bucket', 'info', id]);
      const field = (name: string) => {
        const value = info.match(new RegExp(`^${name}:\\s*(.+)$`, 'm'))?.[1];
        if (!value) throw new Error(`No ${name} in its bucket info`);
        return value.trim();
      };
      return {
        name: info.match(/^Global alias(?:es)?:\s*(\S+)/m)?.[1] ?? id,
        objects: +field('Objects'),
        size: garageBytes(field('Size')),
      };
    })
  );
}

/** Garage, the image storage: what all its buckets hold together, and each, a bucket being a project's. */
export const garage: App = {
  read: async ({ container: c }) => {
    const all = await buckets(c);
    return [
      { label: 'Objects', value: `${all.reduce((n, b) => n + b.objects, 0)}` },
      {
        label: 'Used',
        value: formatBytes(all.reduce((n, b) => n + b.size, 0)),
      },
    ];
  },
  details: async ({ container: c }) => [
    {
      kind: 'table',
      title: 'Buckets',
      columns: [
        { label: 'Name' },
        { label: 'Objects', numeric: true },
        { label: 'Size', numeric: true },
      ],
      rows: (await buckets(c))
        .sort((a, b) => b.size - a.size)
        .map((b) => ({
          cells: [b.name, `${b.objects}`, formatBytes(b.size)],
          dim: b.objects === 0,
        })),
      empty: 'No buckets',
    },
  ],
};
