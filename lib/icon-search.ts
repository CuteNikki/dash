import 'server-only';

import {
  ICON_SETS,
  parseIcon,
  type IconSet,
  type IconVariants,
} from '@/lib/icon-sets';

/** The sets' indexes are fetched again after a day. */
const REFRESH_MS = 24 * 60 * 60 * 1000;

const INDEXES = {
  dashboard:
    'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/tree.json',
  mdi: 'https://cdn.jsdelivr.net/npm/@mdi/svg@7.4.47/meta.json',
  si: 'https://cdn.jsdelivr.net/npm/simple-icons@15.0.0/data/simple-icons.json',
  sh: 'https://cdn.jsdelivr.net/gh/selfhst/icons/index.json',
  // These two have no index of their own; jsDelivr lists their files
  papirus:
    'https://data.jsdelivr.com/v1/packages/gh/PapirusDevelopmentTeam/papirus_icons@master?structure=flat',
  homelab:
    'https://data.jsdelivr.com/v1/packages/gh/loganmarchione/homelab-svg-assets@main?structure=flat',
} satisfies Record<IconSet, string>;

type Entry = {
  /** As a tile stores it, e.g. "mdi-pokeball" */
  icon: string;
  set: IconSet;
  /** Its name in lowercase, for matching */
  name: string;
  /** Other names it's known by, in lowercase */
  aliases: string[];
  /** For icons drawn once for each kind of background */
  variants?: IconVariants;
};

async function json<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return res.json();
}

/** The SVG files in one folder of a repository, as jsDelivr lists them, by name. */
async function svgFiles(listing: string, folder: string) {
  const { files } = await json<{ files: { name: string }[] }>(listing);
  return files
    .map((f) => f.name)
    .filter((path) => path.startsWith(folder) && path.endsWith('.svg'))
    .map((path) => path.slice(folder.length, -'.svg'.length))
    .filter((name) => !name.includes('/'));
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
    const files = await dashboardFiles();
    return [...files]
      .filter((name) => !/-(light|dark)$/.test(name))
      .map((name) => ({
        icon: name,
        set: 'dashboard',
        name,
        aliases: [],
        variants: variantsIn(files, name),
      }));
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
  async papirus() {
    return (await svgFiles(INDEXES.papirus, '/src/')).map((name) => {
      // "games_pokemon_go" is also "pokemon go"
      const words = name.replace(/^[a-z]+_/, '').replaceAll('_', ' ');
      return {
        icon: `papirus-${name}`,
        set: 'papirus',
        name,
        aliases: [words],
      };
    });
  },
  async homelab() {
    return (await svgFiles(INDEXES.homelab, '/assets/')).map((name) => ({
      icon: `homelab-${name}`,
      set: 'homelab',
      name,
      aliases: [],
    }));
  },
};

type Files = { names: Set<string>; at: number };
const files: { current?: Files; loading?: Promise<Files> } = {};

/** Every dashboard-icons file name, variants included. */
async function dashboardFiles() {
  if (files.current && Date.now() - files.current.at < REFRESH_MS) {
    return files.current.names;
  }
  files.loading ??= json<{ svg?: string[] }>(INDEXES.dashboard)
    .then((tree) => {
      const names = new Set(
        (tree.svg ?? []).map((file) => file.replace(/\.svg$/, ''))
      );
      files.current = { names, at: Date.now() };
      return files.current;
    })
    .finally(() => (files.loading = undefined));
  return (await files.loading).names;
}

function variantsIn(names: Set<string>, name: string) {
  const light = names.has(`${name}-light`);
  const dark = names.has(`${name}-dark`);
  if (!light && !dark) return undefined;
  return {
    onLight: dark ? `${name}-dark` : name,
    onDark: light ? `${name}-light` : name,
  } satisfies IconVariants;
}

export type IconInfo = { variants?: IconVariants; missing?: boolean };

/**
 * What's known about each of these dashboard-icons names: whether it has
 * light and dark versions, and whether there's an icon by that name at all,
 * so a page can show the letter instead from the start rather than asking
 * for an image that isn't there. Icons from other sets, and any while the
 * index can't be fetched, are left to the browser.
 */
export async function iconInfo(icons: string[]) {
  const found = new Map<string, IconInfo>();
  const names = await dashboardFiles().catch(() => undefined);
  if (!names) return found;
  for (const icon of icons) {
    if (/^https:\/\//.test(icon) || parseIcon(icon).set !== 'dashboard') {
      continue;
    }
    if (!names.has(icon)) found.set(icon, { missing: true });
    else found.set(icon, { variants: variantsIn(names, icon) });
  }
  return found;
}

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
const SET_ORDER: IconSet[] = [
  'dashboard',
  'sh',
  'homelab',
  'papirus',
  'si',
  'mdi',
];

export type IconMatch = {
  icon: string;
  set: IconSet;
  label: string;
  variants?: IconVariants;
};

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
      variants: entry.variants,
    }));
}
