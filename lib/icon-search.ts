import 'server-only';

import { ICON_SETS, type IconSet } from '@/lib/icon-sets';

/** The sets' indexes are fetched again after a day. */
const REFRESH_MS = 24 * 60 * 60 * 1000;

const INDEXES = {
  dashboard:
    'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/tree.json',
  mdi: 'https://cdn.jsdelivr.net/npm/@mdi/svg@7.4.47/meta.json',
  si: 'https://cdn.jsdelivr.net/npm/simple-icons@15.0.0/data/simple-icons.json',
  sh: 'https://cdn.jsdelivr.net/gh/selfhst/icons/index.json',
} satisfies Record<IconSet, string>;

type Entry = {
  /** As a tile stores it, e.g. "mdi-pokeball" */
  icon: string;
  set: IconSet;
  /** Its name in lowercase, for matching */
  name: string;
  /** Other names it's known by, in lowercase */
  aliases: string[];
};

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

/** Simple Icons' file names, made from titles by its own rule. */
function simpleIconsSlug(title: string) {
  const replacements: Record<string, string> = {
    '+': 'plus',
    '.': 'dot',
    '&': 'and',
    đ: 'd',
    ħ: 'h',
    ı: 'i',
    ĸ: 'k',
    ŀ: 'l',
    ł: 'l',
    ß: 'ss',
    ŧ: 't',
  };
  return title
    .toLowerCase()
    .replace(/[+.&đħıĸŀłßŧ]/g, (c) => replacements[c])
    .normalize('NFD')
    .replace(/[^a-z0-9]/g, '');
}

const loaders: Record<IconSet, () => Promise<Entry[]>> = {
  async dashboard() {
    const tree = await json<{ svg?: string[] }>(INDEXES.dashboard);
    return (tree.svg ?? [])
      .map((file) => file.replace(/\.svg$/, ''))
      .filter((name) => !/-(light|dark)$/.test(name))
      .map((name) => ({ icon: name, set: 'dashboard', name, aliases: [] }));
  },
  async mdi() {
    const meta = await json<
      { name: string; aliases: string[]; deprecated?: boolean }[]
    >(INDEXES.mdi);
    return meta
      .filter((m) => !m.deprecated)
      .map((m) => ({
        icon: `mdi-${m.name}`,
        set: 'mdi',
        name: m.name,
        aliases: m.aliases.map((a) => a.toLowerCase()),
      }));
  },
  async si() {
    const data = await json<
      { title: string; slug?: string; aliases?: { aka?: string[] } }[]
    >(INDEXES.si);
    return data.map((d) => {
      const slug = d.slug ?? simpleIconsSlug(d.title);
      return {
        icon: `si-${slug}`,
        set: 'si',
        name: slug,
        aliases: [d.title, ...(d.aliases?.aka ?? [])].map((a) =>
          a.toLowerCase()
        ),
      };
    });
  },
  async sh() {
    const index = await json<
      { Name: string; Reference: string; SVG: string }[]
    >(INDEXES.sh);
    return index
      .filter((i) => i.SVG === 'Yes')
      .map((i) => ({
        icon: `sh-${i.Reference}`,
        set: 'sh',
        name: i.Reference,
        aliases: [i.Name.toLowerCase()],
      }));
  },
};

type Cache = { entries: Entry[]; at: number };
const cache: { current?: Cache; loading?: Promise<Cache> } = {};

/** Every icon of every set; a set that can't be fetched is left out for now. */
async function allIcons() {
  if (cache.current && Date.now() - cache.current.at < REFRESH_MS) {
    return cache.current.entries;
  }
  cache.loading ??= Promise.allSettled(
    (Object.keys(loaders) as IconSet[]).map((set) => loaders[set]())
  ).then((results) => {
    const entries = results.flatMap((r) =>
      r.status === 'fulfilled' ? r.value : []
    );
    cache.current = { entries, at: Date.now() };
    cache.loading = undefined;
    return cache.current;
  });
  return (await cache.loading).entries;
}

/** Lower is better: the name itself, then names starting with it, then the rest. */
function score(entry: Entry, query: string) {
  if (entry.name === query) return 0;
  if (entry.aliases.includes(query)) return 1;
  if (entry.name.startsWith(query)) return 2;
  if (entry.aliases.some((a) => a.startsWith(query))) return 3;
  if (entry.name.includes(query)) return 4;
  if (entry.aliases.some((a) => a.includes(query))) return 5;
  return undefined;
}

/** dashboard-icons first among equals: they're in color and made for apps. */
const SET_ORDER: IconSet[] = ['dashboard', 'sh', 'si', 'mdi'];

export type IconMatch = { icon: string; set: IconSet; label: string };

export async function searchIcons(query: string, limit: number) {
  const q = query.trim().toLowerCase();
  const entries = await allIcons();
  const found: { entry: Entry; rank: number }[] = [];
  for (const entry of entries) {
    const rank = q ? score(entry, q) : 0;
    if (rank !== undefined) found.push({ entry, rank });
  }
  return found
    .sort(
      (a, b) =>
        a.rank - b.rank ||
        SET_ORDER.indexOf(a.entry.set) - SET_ORDER.indexOf(b.entry.set) ||
        a.entry.name.length - b.entry.name.length
    )
    .slice(0, limit)
    .map(({ entry }): IconMatch => ({
      icon: entry.icon,
      set: entry.set,
      label: ICON_SETS[entry.set].label,
    }));
}
