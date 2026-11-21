import 'server-only';

import { getJson, type App, type AppContext } from '@/lib/apps/app';
import type { DetailCell, DetailSection, WidgetStat } from '@/lib/types';

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

const ms = (value: number | null): DetailCell =>
  value === null ? '–' : { ms: value };

function statsOf(status: BotStatus): WidgetStat[] {
  return [
    { label: 'servers', value: { number: status.servers } },
    { label: 'members', value: { number: status.members } },
    {
      label: 'ping',
      value: status.ping === null ? '–' : { ms: status.ping },
    },
  ];
}

function detailsOf(status: BotStatus): DetailSection[] {
  const more = status.servers - status.biggest.length;
  return [
    {
      kind: 'facts',
      title: 'bot',
      facts: [
        { label: 'name', value: status.name ?? '–' },
        { label: 'id', value: status.id ?? '–' },
        {
          label: 'connectedFor',
          value:
            status.uptime === null ? '–' : { seconds: status.uptime / 1000 },
        },
        { label: 'ping', value: ms(status.ping) },
        { label: 'channels', value: { number: status.channels } },
      ],
    },
    // Each shard on its own, once there's more than one
    ...(status.shards.length > 1
      ? [
          {
            kind: 'table',
            title: 'shards',
            columns: [
              { label: 'shard', numeric: true },
              { label: 'ping', numeric: true },
              { label: 'servers', numeric: true },
            ],
            rows: status.shards.map((s) => ({
              cells: [`${s.id}`, ms(s.ping), { number: s.servers }],
              dim: s.ping === null,
            })),
            empty: 'noShards',
          } satisfies DetailSection,
        ]
      : []),
    {
      kind: 'table',
      title: 'servers',
      columns: [{ label: 'name' }, { label: 'members', numeric: true }],
      rows: [
        ...status.biggest.map((s) => ({
          cells: [s.name, { number: s.members }],
        })),
        // The rest, too many to list, counted
        ...(more > 0
          ? [
              {
                cells: [
                  { text: 'moreSmaller' as const, values: { count: more } },
                  '',
                ],
                dim: true,
              },
            ]
          : []),
      ],
      empty: 'inNoServers',
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
