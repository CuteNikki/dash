import 'server-only';

import type { SiteCheck } from '@/lib/types';

/** How often each site is asked for its page while someone is watching. */
const INTERVAL_MS = 30_000;
/** Checks kept for each graph: ten minutes at one every thirty seconds. */
const HISTORY = 20;
/** Checking stops this long after the dashboard last asked about the sites. */
const IDLE_MS = 120_000;
/** A site that hasn't answered by now is down. */
const TIMEOUT_MS = 10_000;
/** The longest a page load waits for a site's first check. */
const FIRST_WAIT_MS = 3_000;

type Checker = {
  checks: Map<string, SiteCheck>;
  /** The addresses last asked about, which each round checks */
  urls: string[];
  timer?: NodeJS.Timeout;
  /** The copy of this module whose timer runs, as in usage.ts */
  owner?: symbol;
  lastAsked: number;
};

// Kept on globalThis so development's hot reloads keep the checks and don't
// start a second timer, as the usage sampler is
const MODULE = Symbol('sites');
const checker: Checker = ((
  globalThis as typeof globalThis & { siteChecker?: Checker }
).siteChecker ??= { checks: new Map(), urls: [], lastAsked: 0 });
if (checker.owner !== MODULE) {
  clearInterval(checker.timer);
  checker.timer = undefined;
  checker.owner = MODULE;
}

const recent = (history: number[] | undefined, value: number) =>
  [...(history ?? []), value].slice(-HISTORY);

/** Why a request failed, in a few words: "No answer in 10 s", "ENOTFOUND"… */
function reason(error: unknown) {
  if (error instanceof Error) {
    if (error.name === 'TimeoutError') {
      return `No answer in ${TIMEOUT_MS / 1000} s`;
    }
    const cause = (error.cause as { code?: string } | undefined)?.code;
    return cause ?? error.message;
  }
  return String(error);
}

/** Asks a site for its page, following redirects, and notes how it went. */
async function check(url: string) {
  const start = performance.now();
  let result: Pick<SiteCheck, 'ok' | 'status' | 'error'>;
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': 'dash (status check)' },
    });
    // Only whether and how fast it answers, not the page itself
    await res.body?.cancel();
    result = { ok: res.status < 400, status: res.status };
  } catch (error) {
    result = { ok: false, error: reason(error) };
  }
  const ms = performance.now() - start;
  const at = Date.now();
  const last = checker.checks.get(url)?.history;
  checker.checks.set(url, {
    ...result,
    ms,
    at,
    history: { at: recent(last?.at, at), ms: recent(last?.ms, ms) },
  });
}

async function round() {
  if (Date.now() - checker.lastAsked > IDLE_MS) {
    clearInterval(checker.timer);
    checker.timer = undefined;
    return;
  }
  await Promise.all(checker.urls.map(check));
}

/**
 * How each site was last found, starting the checks if needed. One not
 * checked yet is waited for a moment, so a first page load usually has it.
 */
export async function currentSites(urls: string[]) {
  checker.lastAsked = Date.now();
  checker.urls = urls;
  for (const url of checker.checks.keys()) {
    if (!urls.includes(url)) checker.checks.delete(url);
  }
  if (!checker.timer) {
    checker.timer = setInterval(
      () => void round().catch(console.error),
      INTERVAL_MS
    );
  }
  const unchecked = urls.filter((url) => !checker.checks.has(url));
  if (unchecked.length) {
    await Promise.race([
      Promise.all(unchecked.map(check)),
      new Promise((resolve) => setTimeout(resolve, FIRST_WAIT_MS)),
    ]);
  }
  return checker.checks;
}
