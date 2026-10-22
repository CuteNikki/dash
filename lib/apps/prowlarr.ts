import 'server-only';

import { env, getJson, once, stats, type App } from '@/lib/apps/app';

type IndexerStats = {
  indexerId: number;
  indexerName: string;
  numberOfQueries: number;
  numberOfGrabs: number;
  numberOfFailedQueries: number;
  numberOfFailedGrabs: number;
};

/** One that's failed lately: until when Prowlarr leaves it alone before trying again. */
type IndexerStatus = { indexerId: number; disabledTill?: string };

/** What Prowlarr knows about its indexers, each asked for once however many need it. */
function prowlarrApi(url: string) {
  const headers = { 'X-Api-Key': env('PROWLARR_API_KEY')! };
  const get = <T>(path: string) =>
    once(() => getJson<T>(`${url}${path}`, headers));
  return {
    indexers:
      get<{ id: number; name: string; enable: boolean }[]>('/api/v1/indexer'),
    stats: get<{ indexers: IndexerStats[] }>('/api/v1/indexerstats'),
    statuses: get<IndexerStatus[]>('/api/v1/indexerstatus'),
  };
}

/** Its indexers it's leaving alone for now, after failing, by id: until when. */
async function failing(api: ReturnType<typeof prowlarrApi>) {
  const now = Date.now();
  return new Map(
    (await api.statuses()).flatMap((s) => {
      const until = s.disabledTill ? Date.parse(s.disabledTill) : 0;
      return until > now ? [[s.indexerId, until] as const] : [];
    })
  );
}

export const prowlarr: App = {
  port: 9696,
  ready: () => !!env('PROWLARR_API_KEY'),
  read: ({ url }) => {
    const api = prowlarrApi(url);
    return stats([
      [
        'Indexers',
        async () => (await api.indexers()).filter((i) => i.enable).length,
      ],
      [
        'Grabs',
        async () =>
          (await api.stats()).indexers.reduce(
            (sum, i) => sum + i.numberOfGrabs,
            0
          ),
      ],
      ['Failing', async () => (await failing(api)).size],
    ]);
  },
  details: async ({ url }) => {
    const api = prowlarrApi(url);
    const [indexers, { indexers: counts }, failingUntil] = await Promise.all([
      api.indexers(),
      api.stats(),
      failing(api),
    ]);
    const countsOf = new Map(counts.map((c) => [c.indexerId, c]));
    return [
      {
        kind: 'table',
        title: 'Indexers',
        columns: [
          { label: 'Name' },
          { label: 'Queries', numeric: true },
          { label: 'Grabs', numeric: true },
          { label: 'Failed', numeric: true },
          { label: 'State' },
          // When Prowlarr tries a failing one again
          { label: 'Retried', numeric: true },
        ],
        // The most used first; those turned off quiet
        rows: indexers
          .map((i) => ({ i, c: countsOf.get(i.id) }))
          .sort((a, b) => (b.c?.numberOfGrabs ?? 0) - (a.c?.numberOfGrabs ?? 0))
          .map(({ i, c }) => {
            const until = failingUntil.get(i.id);
            return {
              cells: [
                i.name,
                `${c?.numberOfQueries ?? 0}`,
                `${c?.numberOfGrabs ?? 0}`,
                `${(c?.numberOfFailedQueries ?? 0) + (c?.numberOfFailedGrabs ?? 0)}`,
                !i.enable ? 'off' : until ? 'failing' : 'ok',
                i.enable && until ? { at: until } : '–',
              ],
              dim: !i.enable,
            };
          }),
        empty: 'No indexers',
      },
    ];
  },
};
