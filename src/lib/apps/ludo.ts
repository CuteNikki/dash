import 'server-only';

import { getJson, type App } from '@/lib/apps/app';

/** What Ludo's game server says at /status, in its repository's room-manager.ts. */
type LudoStats = {
  rooms: { lobby: number; playing: number; finished: number };
  /** People connected to a room, not counting bots or watchers */
  players: number;
  bots: number;
  spectators: number;
};

const stats = (url: string) => getJson<LudoStats>(`${url}/status`, {});

/** Ludo's game server: who's playing, and in how many games. */
export const ludo: App = {
  port: 3001,
  read: async ({ url }) => {
    const { players, rooms, spectators } = await stats(url);
    return [
      { label: 'Players', value: `${players}` },
      { label: 'Games', value: `${rooms.playing}` },
      // Only when someone is, as it usually isn't
      ...(spectators ? [{ label: 'Watching', value: `${spectators}` }] : []),
    ];
  },
  details: async ({ url }) => {
    const { players, rooms, bots, spectators } = await stats(url);
    return [
      {
        kind: 'facts',
        title: 'Rooms',
        facts: [
          { label: 'Playing', value: `${rooms.playing}` },
          { label: 'In the lobby', value: `${rooms.lobby}` },
          { label: 'Voting on a rematch', value: `${rooms.finished}` },
        ],
      },
      {
        kind: 'facts',
        title: 'In them',
        facts: [
          { label: 'Players', value: `${players}` },
          { label: 'Bots', value: `${bots}` },
          { label: 'Watching', value: `${spectators}` },
        ],
      },
    ];
  },
};
