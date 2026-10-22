import 'server-only';

import { inTime, type App } from '@/lib/apps/app';
import { formatBytes } from '@/lib/format';
import { postgresRows } from '@/lib/postgres';

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
      { label: 'Connections', value: `${connections} / ${max}` },
      // "16.15", or "18.1 (Debian 18.1-1)" from some builds
      { value: `v${version.split(' ')[0]}` },
      { label: 'Databases', value: databases },
      { label: 'Used', value: formatBytes(+size) },
    ];
  },
};
