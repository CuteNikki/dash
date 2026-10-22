/** The most columns a tile spans: the widest grid's. */
export const MAX_WIDTH = 8;
/** The most rows a tile spans. */
export const MAX_HEIGHT = 6;

/**
 * The columns at each width of screen, about 300px each: 2 from sm, then one
 * more for each step, up to 8 on a 1440p screen. Each a tile can span, in
 * the same order. In rem, as Tailwind's own breakpoints are, so it sorts
 * them in with those. Written out whole for Tailwind to find.
 */
const GRID_COLUMNS = [
  'sm:grid-cols-2',
  'lg:grid-cols-3',
  'xl:grid-cols-4',
  '2xl:grid-cols-5',
  'min-[116rem]:grid-cols-6',
  'min-[136rem]:grid-cols-7',
  'min-[156rem]:grid-cols-8',
];
const SPANS = [
  'sm:col-span-2',
  'lg:col-span-3',
  'xl:col-span-4',
  '2xl:col-span-5',
  'min-[116rem]:col-span-6',
  'min-[136rem]:col-span-7',
  'min-[156rem]:col-span-8',
];

/** The grid tiles sit in: the server's stats and each group's services. */
export const TILE_GRID = [
  // Each row at least a tile's height, so a taller tile is that many tall
  'grid auto-rows-[minmax(6rem,auto)] grid-cols-1 gap-3',
  ...GRID_COLUMNS,
].join(' ');

const ROWS = [
  '',
  '',
  'row-span-2',
  'row-span-3',
  'row-span-4',
  'row-span-5',
  'row-span-6',
];

/**
 * The classes a tile of this size takes in its grid. A wide tile spans as
 * many columns as a narrower screen has, filling its row rather than adding
 * columns to it.
 */
export function spanClasses(width: number, height: number) {
  return `${SPANS.slice(0, width - 1).join(' ')} ${ROWS[height] ?? ''}`;
}
