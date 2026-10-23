import 'server-only';

import { execShared, type Container } from '@/lib/docker/docker';
import type { DetailSection, WidgetStat } from '@/lib/types';

/** How long an app has to answer. */
export const TIMEOUT_MS = 4_000;

/** Where an app is: its container, and for one read over HTTP, its address. */
export type AppContext = { container: Container; url: string };

/** An app the dashboard knows how to read: numbers for its tile, and more for its window. */
export type App = {
  /**
   * Its port, for one read over HTTP: at its container by name on a network
   * the dashboard shares with it, or at SONARR_URL and so on
   */
  port?: number;
  /** Its key, or its user and password, from the dashboard's .env, when it needs any */
  ready?: () => boolean;
  read: (app: AppContext) => Promise<WidgetStat[]>;
  details?: (app: AppContext) => Promise<DetailSection[]>;
};

export const env = (name: string) => process.env[name] || undefined;

/** What something gives, or an error once it's taken longer than an app has. */
export function inTime<T>(promise: Promise<T>, what: string) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${what} took too long`)),
        TIMEOUT_MS
      );
    }),
  ]).finally(() => clearTimeout(timer));
}

/**
 * What a command printed in a container, or an error if it failed or took
 * too long; one still running from the last refresh is waited on again.
 */
export async function run(c: Container, cmd: string[]) {
  const { stdout, exitCode } = await inTime(execShared(c.id, cmd), cmd[0]);
  if (exitCode !== 0) throw new Error(`${cmd[0]} exited with ${exitCode}`);
  return stdout;
}

/** JSON from an app's API, or an error naming what failed. */
export async function getJson<T>(
  url: string,
  headers: HeadersInit
): Promise<T> {
  const res = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`${res.status} from ${new URL(url).pathname}`);
  return res.json();
}

/**
 * Each stat on its own, so one the app's version doesn't have leaves the
 * others; only when none can be read is it an error.
 */
export async function stats(
  reads: [label: string | undefined, read: () => Promise<string | number>][]
): Promise<WidgetStat[]> {
  const results = await Promise.allSettled(reads.map(([, read]) => read()));
  const read = results.flatMap((r, i): WidgetStat[] =>
    r.status === 'fulfilled'
      ? [{ label: reads[i][0], value: `${r.value}` }]
      : []
  );
  if (!read.length) {
    throw (
      results.find((r) => r.status === 'rejected') as PromiseRejectedResult
    ).reason;
  }
  return read;
}

/** Asks once for what two stats are read from, however many ask. */
export function once<T>(get: () => Promise<T>) {
  let promise: Promise<T> | undefined;
  return () => (promise ??= get());
}
