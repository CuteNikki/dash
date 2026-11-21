import 'server-only';

import { inTime, type App } from '@/lib/apps/app';
import { postgresDatabases, postgresRows } from '@/lib/postgres';

/** Its databases, each with its size and connections, are in its window. */
export const postgres: App = {
  read: async ({ container: c }) => {
    const [[connections, max, databases, size, version]] = await inTime(
      postgresRows(
        c.id,
        `select
           (select count(*) from pg_stat_activity where backend_type = 'client backend'),
           current_setting('max_connections'),
           count(*),
           sum(pg_database_size(datname)),
           current_setting('server_version')
         from pg_database where not datistemplate`
      ),
      'psql'
    );
    // The version second, short enough to share the first line with the
    // connections, so the four take two lines rather than three
    return [
      { label: 'conns', value: `${connections} / ${max}` },
      // "16.15", or "18.1 (Debian 18.1-1)" from some builds
      { label: 'version', bare: true, value: `v${version.split(' ')[0]}` },
      { label: 'databases', value: { number: +databases } },
      { label: 'used', value: { bytes: +size } },
    ];
  },
  details: async ({ container: c }) => [
    {
      kind: 'table',
      title: 'databases',
      columns: [
        { label: 'name' },
        { label: 'size', numeric: true },
        { label: 'conns', numeric: true },
      ],
      // Biggest first, those no one's connected to quiet
      rows: (await inTime(postgresDatabases(c.id), 'psql')).map((db) => ({
        cells: [db.name, { bytes: db.size }, { number: db.connections }],
        dim: db.connections === 0,
      })),
      empty: 'noDatabases',
    },
  ],
};
