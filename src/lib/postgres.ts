import 'server-only';

import { execShared } from '@/lib/docker/docker';

/**
 * Rows from a query, run with psql in a Postgres container as its superuser
 * over the container's own socket, so it needs no password. Each row's
 * columns are text. A query still running from the last refresh, as when
 * the server's busy, is waited on again rather than asked twice.
 */
export async function postgresRows(containerId: string, sql: string) {
  const { stdout, stderr, exitCode } = await execShared(containerId, [
    'psql',
    '-U',
    'postgres',
    '-tA',
    '-F',
    '\t',
    '-c',
    sql,
  ]);
  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `psql exited with ${exitCode}`);
  }
  return stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => line.split('\t'));
}

/** One of a Postgres server's databases. */
export type PostgresDatabase = {
  name: string;
  /** Bytes */
  size: number;
  connections: number;
};

/** Its databases, biggest first, leaving out the templates new ones are copied from. */
export async function postgresDatabases(
  containerId: string
): Promise<PostgresDatabase[]> {
  const rows = await postgresRows(
    containerId,
    `select datname, pg_database_size(datname),
       (select count(*) from pg_stat_activity a where a.datname = d.datname)
     from pg_database d where not datistemplate
     order by pg_database_size(datname) desc`
  );
  return rows.map(([name, size, connections]) => ({
    name,
    size: +size,
    connections: +connections,
  }));
}
