import 'server-only';

import { inBackground } from '@/lib/background';
import { lastMinutes } from '@/lib/recent';
import type { SiteCheck } from '@/lib/types';

/** How often each site is asked for its page while someone is watching. */
const INTERVAL_MS = 30_000;
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

/** A list of checks with one more on the end; lastMinutes trims them after. */
const recent = (history: number[] | undefined, value: number) => [
  ...(history ?? []),
  value,
];

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

/**
 * The icon a page names in its head, as an address: an SVG if it has one,
 * else its biggest icon, else its home-screen one; its /favicon.ico if it
 * names none, as browsers look for then. Many sites have no /favicon.ico
 * and name an icon elsewhere, such as Next.js's /icon.svg?….
 */
export function pageIcon(html: string, page: string) {
  const attr = (tag: string, name: string) =>
    tag.match(new RegExp(`\\s${name}\\s*=\\s*["']([^"']*)["']`, 'i'))?.[1];
  const links = (html.match(/<link\b[^>]*>/gi) ?? []).flatMap((tag) => {
    const rel = attr(tag, 'rel')?.toLowerCase().split(/\s+/) ?? [];
    const href = attr(tag, 'href');
    if (!href || !rel.some((r) => r === 'icon' || r === 'apple-touch-icon')) {
      return [];
    }
    const svg =
      attr(tag, 'type') === 'image/svg+xml' || /\.svg(\?|$)/i.test(href);
    const size = Number(attr(tag, 'sizes')?.match(/^(\d+)x/)?.[1] ?? 0);
    // An SVG first, then rel="icon" over a home-screen one, bigger first
    const rank = (svg ? 1e6 : 0) + (rel.includes('icon') ? 1e4 : 0) + size;
    return [{ href, rank }];
  });
  const best = links.sort((a, b) => b.rank - a.rank)[0];
  try {
    return new URL(best?.href ?? '/favicon.ico', page).href;
  } catch {
    return undefined;
  }
}

/** The most of a page read to find its icon, which is in its head. */
const HEAD_BYTES = 64 * 1024;

/** Up to the first so many bytes of a page, as text. */
async function readHead(res: Response) {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < HEAD_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  await reader.cancel();
  return Buffer.concat(chunks).toString('utf8');
}

/** How a site answered one check, or didn't. */
export type SiteProbe = Pick<
  SiteCheck,
  'ok' | 'status' | 'error' | 'icon' | 'ms'
>;

/**
 * Asks a site for its page, following redirects, and says how it went, and
 * when asked to, the icon its page names, if it answers with one.
 */
export async function probeSite(
  url: string,
  findIcon = false
): Promise<SiteProbe> {
  const start = performance.now();
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': 'Dashboard (status check)' },
    });
    // How fast it answers, not how long its page takes to arrive
    const ms = performance.now() - start;
    const ok = res.status < 400;
    let icon: string | undefined;
    if (findIcon && ok && res.headers.get('content-type')?.includes('html')) {
      icon = pageIcon(await readHead(res).catch(() => ''), res.url || url);
    } else {
      await res.body?.cancel();
    }
    return { ok, status: res.status, icon, ms };
  } catch (error) {
    return { ok: false, error: reason(error), ms: performance.now() - start };
  }
}

/** Checks a site and notes how it went, its icon kept from the first time it had one. */
async function check(url: string) {
  const before = checker.checks.get(url);
  const result = await probeSite(url, !before?.icon);
  const at = Date.now();
  const last = before?.history;
  checker.checks.set(url, {
    ...result,
    icon: result.icon ?? before?.icon,
    at,
    history: lastMinutes({
      at: recent(last?.at, at),
      ms: recent(last?.ms, result.ms),
    }),
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
  // Apart from the page that asked, which may be a prerender over before the
  // checks are: its fetch() would reject every one after, and each site be down
  if (!checker.timer) {
    checker.timer = inBackground(() =>
      setInterval(() => void round().catch(console.error), INTERVAL_MS)
    );
  }
  const unchecked = urls.filter((url) => !checker.checks.has(url));
  if (unchecked.length) {
    await Promise.race([
      inBackground(() => Promise.all(unchecked.map(check))),
      new Promise((resolve) => setTimeout(resolve, FIRST_WAIT_MS)),
    ]);
  }
  return checker.checks;
}
