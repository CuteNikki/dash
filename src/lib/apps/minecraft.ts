import 'server-only';

import { once, run, stats, type App } from '@/lib/apps/app';
import type { Container } from '@/lib/docker/docker';

/** What rcon-cli prints, without its colors. */
async function rcon(c: Container, command: string) {
  return (await run(c, ['rcon-cli', command])).replace(/\x1b\[[\d;]*m/g, '');
}

/** "TPS from last 1m, 5m, 15m: 20.0, 20.0, 20.0", with a * on any caught up past 20. */
async function tps(c: Container) {
  const out = await rcon(c, 'tps');
  const values = out
    .split(':')
    .pop()
    ?.match(/[\d.]+/g);
  if (values?.length !== 3) throw new Error(`Unexpected: ${out}`);
  return values;
}

type Status = {
  server_info: {
    version: { name: string };
    players: { online: number; max: number };
  };
};

/** itzg/minecraft-server, which comes with mc-monitor and rcon-cli. */
export const minecraft: App = {
  read: ({ container: c }) => {
    const status = once(
      async () =>
        JSON.parse(await run(c, ['mc-monitor', 'status', '--json'])) as Status
    );
    return stats([
      [
        'players',
        async () => {
          const { players } = (await status()).server_info;
          // "1 / 20 players": a share, its label in the plural
          return `${players.online} / ${players.max}`;
        },
      ],
      ['tps', async () => ({ fixed: +(await tps(c))[0], digits: 1 })],
      // "Paper 26.2" says what it is without a label
      [
        { bare: 'version' },
        async () => (await status()).server_info.version.name,
      ],
    ]);
  },
  details: async ({ container: c }) => {
    // "There are 2 of a max of 20 players online: nikki, someone"
    const list = await rcon(c, 'list');
    const names = list
      .split(':')
      .slice(1)
      .join(':')
      .split(',')
      .map((name) => name.trim())
      .filter(Boolean);
    const [one, five, fifteen] = await tps(c);
    return [
      {
        kind: 'table',
        title: 'online',
        columns: [{ label: 'player' }],
        rows: names.sort().map((name) => ({ cells: [name] })),
        empty: 'noOneOnline',
      },
      {
        kind: 'facts',
        title: 'ticksPerSecond',
        facts: [
          { label: 'lastMinute', value: { fixed: +one, digits: 1 } },
          { label: 'last5Minutes', value: { fixed: +five, digits: 1 } },
          { label: 'last15Minutes', value: { fixed: +fifteen, digits: 1 } },
        ],
      },
    ];
  },
};
