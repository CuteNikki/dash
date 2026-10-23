/** How far back the live graphs go, while someone's watching. */
export const LIVE_WINDOW_MS = 10 * 60_000;

/**
 * Readings as they're kept for a live graph: only those of the last ten
 * minutes, by when each was taken, as `at` says. Measuring pauses while
 * nobody's watching, so a count of readings could reach back past a pause
 * to readings far older. Each of its lists keeps as many as `at` does, from
 * the end, a core's list inside one too.
 */
export function lastMinutes<T extends { at: number[] }>(
  history: T,
  now = Date.now()
): T {
  const first = history.at.findIndex((t) => t >= now - LIVE_WINDOW_MS);
  const keep = first < 0 ? 0 : history.at.length - first;
  const tail = (list: unknown[]) => (keep ? list.slice(-keep) : []);
  return Object.fromEntries(
    Object.entries(history as Record<string, unknown[]>).map(([name, list]) => [
      name,
      Array.isArray(list[0]) ? (list as unknown[][]).map(tail) : tail(list),
    ])
  ) as T;
}
