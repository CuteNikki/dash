import 'server-only';

import { getJson, type App, type AppContext } from '@/lib/apps/app';
import { formatDuration } from '@/lib/format';
import type { DetailSection, WidgetStat } from '@/lib/types';

/**
 * What a Discord bot says of itself at GET /status, from what it already
 * knows, so nothing asks Discord: as PokeHelper, the Tinderhaj bot and
 * CuteNikki/DiscordBot serve it. Labelled dash.app: discord-bot.
 */
type BotStatus = {
  ready: boolean;
  name: string | null;
  id: string | null;
  avatar: string | null;
  /** Milliseconds connected */
  uptime: number | null;
  /** Milliseconds to Discord and back, on average */
  ping: number | null;
  shards: { id: number; ping: number | null; servers: number }[];
  servers: number;
  members: number;
  channels: number;
  /** Its biggest servers, up to a hundred */
  biggest: { name: string; members: number }[];
};

// Each bot's avatar as it last said it, by container, for its icon, which
// can't wait for it. Kept on globalThis so development's hot reloads keep them
const avatars: Map<string, string> = ((
  globalThis as typeof globalThis & { botAvatars?: Map<string, string> }
).botAvatars ??= new Map());

async function statusOf({ container: c, url }: AppContext) {
  const status = await getJson<BotStatus>(`${url}/status`, {});
  if (status.avatar) avatars.set(c.id, status.avatar);
  if (!status.ready) throw new Error('Not connected to Discord yet');
  return status;
}

const ms = (value: number | null) => (value === null ? '–' : `${value} ms`);

function statsOf(status: BotStatus): WidgetStat[] {
  return [
    { label: 'Servers', value: `${status.servers}` },
    { label: 'Members', value: `${status.members}` },
    { label: 'Ping', value: ms(status.ping) },
  ];
}

function detailsOf(status: BotStatus): DetailSection[] {
  const more = status.servers - status.biggest.length;
  return [
    {
      kind: 'facts',
      title: 'Bot',
      facts: [
        { label: 'Name', value: status.name ?? '–' },
        { label: 'ID', value: status.id ?? '–' },
        {
          label: 'Connected for',
          value:
            status.uptime === null ? '–' : formatDuration(status.uptime / 1000),
        },
        { label: 'Ping', value: ms(status.ping) },
        { label: 'Channels', value: `${status.channels}` },
      ],
    },
    // Each shard on its own, once there's more than one
    ...(status.shards.length > 1
      ? [
          {
            kind: 'table' as const,
            title: 'Shards',
            columns: [
              { label: 'Shard', numeric: true },
              { label: 'Ping', numeric: true },
              { label: 'Servers', numeric: true },
            ],
            rows: status.shards.map((s) => ({
              cells: [`${s.id}`, ms(s.ping), `${s.servers}`],
              dim: s.ping === null,
            })),
            empty: 'No shards',
          },
        ]
      : []),
    {
      kind: 'table',
      title: 'Servers',
      columns: [{ label: 'Name' }, { label: 'Members', numeric: true }],
      rows: [
        ...status.biggest.map((s) => ({ cells: [s.name, `${s.members}`] })),
        // The rest, too many to list, counted
        ...(more > 0
          ? [{ cells: [`${more} more, smaller`, ''], dim: true }]
          : []),
      ],
      empty: 'In no servers',
    },
  ];
}

/** A Discord bot: its servers, members and ping on its tile, more in its window, its avatar as its icon. */
export const discordBot: App = {
  port: 8080,
  read: async (app) => statsOf(await statusOf(app)),
  details: async (app) => detailsOf(await statusOf(app)),
  icon: ({ container: c }) => avatars.get(c.id),
};
