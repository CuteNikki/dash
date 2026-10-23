import 'server-only';

import { db } from '@/lib/db';
import { HISTORY_RANGES, type HistoryRange } from '@/lib/monitor/ranges';
import type { History, HostHistory, ServiceHistory } from '@/lib/types';

/**
 * A table's readings over a range, a point for each stretch of it, from
 * oldest to now: each column's SQL over the readings in that stretch, or
 * null for one with none, as while the dashboard was down. Only for this
 * file's own tables and columns, which go into the query as they are.
 */
async function bucketed<K extends string>(
  table: string,
  columns: Record<K, string>,
  range: HistoryRange,
  key?: string
): Promise<History<K>> {
  const { ms, bucket } = HISTORY_RANGES[range];
  // Stretches line up on the clock, the last the one now is in
  const end = Math.floor(Date.now() / bucket) * bucket + bucket;
  const start = end - ms;
  const names = Object.keys(columns) as K[];
  const select = names
    .map((name) => `(${columns[name]})::float8 as "${name}"`)
    .join(', ');
  // The times are kept in UTC, without a zone
  const rows = await db.$queryRawUnsafe<({ t: number } & Record<K, number>)[]>(
    `select floor(extract(epoch from at) * 1000 / $1::float8) * $1::float8 as t, ${select}
     from "${table}"
     where at >= (to_timestamp($2::float8 / 1000) at time zone 'UTC')
       ${key === undefined ? '' : 'and key = $3'}
     group by t order by t`,
    bucket,
    start,
    ...(key === undefined ? [] : [key])
  );
  const byStart = new Map(rows.map((r) => [Number(r.t), r]));
  const at: number[] = [];
  const series = new Map(names.map((name) => [name, [] as (number | null)[]]));
  for (let t = start; t < end; t += bucket) {
    at.push(t);
    const row = byStart.get(t);
    for (const name of names) series.get(name)!.push(row ? row[name] : null);
  }
  return { at, ...Object.fromEntries(series) } as History<K>;
}

/**
 * The server over a range: averages, but the slowest the disk was, as a
 * stall a few seconds long is what's looked for, and the disk at its fullest.
 */
export function hostHistory(range: HistoryRange): Promise<HostHistory> {
  return bucketed(
    'HostSample',
    {
      cpu: 'avg(cpu)',
      memory: 'avg(memory)',
      diskUsed: 'max("diskUsed")',
      received: 'avg(received)',
      sent: 'avg(sent)',
      diskRead: 'avg("diskRead")',
      diskWritten: 'avg("diskWritten")',
      diskWait: 'max("diskWait")',
      load: 'avg(load)',
    },
    range
  );
}

/** A service's CPU and memory over a range, by its tile key. */
export function serviceHistory(
  key: string,
  range: HistoryRange
): Promise<ServiceHistory> {
  return bucketed(
    'ContainerSample',
    { cpu: 'avg(cpu)', memory: 'avg(memory)' },
    range,
    key
  );
}
