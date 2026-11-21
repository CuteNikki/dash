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
      { label: 'players', value: { number: players } },
      { label: 'games', value: { number: rooms.playing } },
      // Only when someone is, as it usually isn't
      ...(spectators
        ? [{ label: 'watching' as const, value: { number: spectators } }]
        : []),
    ];
  },
  details: async ({ url }) => {
    const { players, rooms, bots, spectators } = await stats(url);
    return [
      {
        kind: 'facts',
        title: 'rooms',
        facts: [
          { label: 'playing', value: { number: rooms.playing } },
          { label: 'inLobby', value: { number: rooms.lobby } },
          { label: 'votingRematch', value: { number: rooms.finished } },
        ],
      },
      {
        kind: 'facts',
        title: 'inThem',
        facts: [
          { label: 'players', value: { number: players } },
          { label: 'bots', value: { number: bots } },
          { label: 'watching', value: { number: spectators } },
        ],
      },
    ];
  },
};
