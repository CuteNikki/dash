import 'server-only';

import { AsyncLocalStorage } from 'node:async_hooks';

type Outside = <R>(work: () => R) => R;

// On globalThis, as instrumentation is bundled apart from the pages
const kept = globalThis as typeof globalThis & { outsideRequests?: Outside };

/** Called at server start, outside any request, to run work there later. */
export function keepOutsideRequests() {
  kept.outsideRequests ??= AsyncLocalStorage.snapshot();
}

/**
 * Runs work that outlives the request that starts it, as a look for updates
 * does, as if from server start rather than as part of that request: begun
 * during a prerender, as a page's runtime prefetch is, Next's fetch() would
 * otherwise reject as soon as that prerender is done.
 */
export function inBackground<R>(work: () => R): R {
  return kept.outsideRequests ? kept.outsideRequests(work) : work();
}
