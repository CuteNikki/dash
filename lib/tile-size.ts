/** The most columns a tile spans: the widest grid's. */
export const MAX_WIDTH = 4;
/** The most rows a tile spans. */
export const MAX_HEIGHT = 3;

/**
 * Column spans by width, capped at each breakpoint's columns, so a wide tile
 * fills a narrower grid's row rather than adding columns to it. Written out
 * whole for Tailwind to find.
 */
const COLUMNS = [
  '',
  '',
  'sm:col-span-2',
  'sm:col-span-2 lg:col-span-3',
  'sm:col-span-2 lg:col-span-3 xl:col-span-4',
];

const ROWS = ['', '', 'row-span-2', 'row-span-3'];

/** The classes a tile of this size takes in its group's grid. */
export function spanClasses(width: number, height: number) {
  return `${COLUMNS[width] ?? ''} ${ROWS[height] ?? ''}`;
}
