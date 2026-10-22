import 'server-only';

import { once, run, stats, type App } from '@/lib/apps/app';

/** itzg/minecraft-server, which comes with mc-monitor and rcon-cli. */
export const minecraft: App = {
  read: ({ container: c }) => {
    const status = once(
      async () =>
        JSON.parse(await run(c, ['mc-monitor', 'status', '--json'])) as {
          server_info: {
            version: { name: string };
            players: { online: number; max: number };
          };
        }
    );
    return stats([
      [
        'Players',
        async () => {
          const { players } = (await status()).server_info;
          return `${players.online} / ${players.max}`;
        },
      ],
      [
        'TPS',
        async () => {
          // "TPS from last 1m, 5m, 15m: 20.0, 20.0, 20.0", in color, and
          // with a * when it's caught up past 20
          const out = (await run(c, ['rcon-cli', 'tps'])).replace(
            /\x1b\[[\d;]*m/g,
            ''
          );
          const tps = out.match(/:\s*\*?([\d.]+)/)?.[1];
          if (!tps) throw new Error(`Unexpected: ${out}`);
          return tps;
        },
      ],
      // "Paper 26.2" says what it is without a label
      [undefined, async () => (await status()).server_info.version.name],
    ]);
  },
};
