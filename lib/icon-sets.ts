/**
 * The icon sets a tile can use, named the way Homepage names them. Shared by
 * the picker's search (on the server) and by drawing icons (in the browser).
 */
export const ICON_SETS = {
  dashboard: {
    label: 'dashboard-icons',
    prefix: '',
    url: 'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/svg',
    /** One color, drawn in the text color so it suits either theme */
    mono: false,
  },
  mdi: {
    label: 'Material Design Icons',
    prefix: 'mdi-',
    url: 'https://cdn.jsdelivr.net/npm/@mdi/svg@7.4.47/svg',
    mono: true,
  },
  si: {
    label: 'Simple Icons',
    prefix: 'si-',
    url: 'https://cdn.jsdelivr.net/npm/simple-icons@15.0.0/icons',
    mono: true,
  },
  sh: {
    label: 'selfh.st icons',
    prefix: 'sh-',
    url: 'https://cdn.jsdelivr.net/gh/selfhst/icons/svg',
    mono: false,
  },
} as const;

export type IconSet = keyof typeof ICON_SETS;

/** Which set an icon name belongs to, and its file name there. */
export function parseIcon(icon: string): { set: IconSet; name: string } {
  for (const set of ['mdi', 'si', 'sh'] as const) {
    const { prefix } = ICON_SETS[set];
    if (icon.startsWith(prefix)) {
      return { set, name: icon.slice(prefix.length) };
    }
  }
  return { set: 'dashboard', name: icon };
}

export function iconFileUrl(icon: string) {
  const { set, name } = parseIcon(icon);
  return `${ICON_SETS[set].url}/${encodeURIComponent(name)}.svg`;
}

/**
 * The icons to draw on a light and on a dark background, for icons drawn
 * twice. dashboard-icons names them so: "glances" in dark colors for light
 * backgrounds, "glances-light" in light colors for dark ones, and "-dark" the
 * other way around where the plain one is the light one.
 */
export type IconVariants = { onLight: string; onDark: string };
