/**
 * Where tiles sit in a grid: each at a column and row. Every width lays them
 * out from one order and their sizes (see FLOW), row by row. The layouts
 * each number of columns once had of its own, arranged there, now only seed
 * that order until it's first arranged.
 */

/** A tile's place: its first column and row, from 0, and the columns and rows it spans. */
export type Cell = { x: number; y: number; w: number; h: number };

/** Tiles' places by their keys. */
export type Layout = Map<string, Cell>;

/** A saved place, at one number of columns. */
export type SavedCell = Cell & { key: string; columns: number };

/** The most columns a grid has, on the widest screens. */
export const MAX_COLUMNS = 8;
/** The most rows a tile spans. */
export const MAX_ROWS = 6;

/** A column for about every 300px of screen, from 1 on a phone to 8 on 1440p. */
export const COLUMN_BREAKPOINTS = [640, 1024, 1280, 1536, 1856, 2176, 2496];

export function columnsFor(screenWidth: number) {
  return 1 + COLUMN_BREAKPOINTS.filter((b) => screenWidth >= b).length;
}

/** Where the browser keeps its columns, for the server to draw the next page with. */
export const COLUMNS_COOKIE = 'dash-columns';

/** The cookie's columns; none on a first visit. */
export function columnsFromCookie(value?: string) {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 && n <= MAX_COLUMNS ? n : undefined;
}

function overlaps(a: Cell, b: Cell) {
  return (
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  );
}

/** A cell kept inside the columns there are. */
export function fit(cell: Cell, columns: number): Cell {
  const w = Math.min(Math.max(cell.w, 1), columns);
  const h = Math.min(Math.max(cell.h, 1), MAX_ROWS);
  return {
    w,
    h,
    x: Math.min(Math.max(cell.x, 0), columns - w),
    y: Math.max(cell.y, 0),
  };
}

/** By row, then column: the order tiles are read in. */
export function readingOrder(layout: Layout) {
  return [...layout].sort(([, a], [, b]) => a.y - b.y || a.x - b.x);
}

/**
 * Tiles of these sizes one after another, each in the first place it fits
 * from where the one before it went, as text flows: what a layout that
 * hasn't been arranged looks like.
 */
export function pack(
  tiles: { key: string; w: number; h: number }[],
  columns: number
): Layout {
  const layout: Layout = new Map();
  let at = { x: 0, y: 0 };
  for (const tile of tiles) {
    const w = Math.min(tile.w, columns);
    const h = Math.min(tile.h, MAX_ROWS);
    let { x, y } = at;
    for (;;) {
      if (x + w > columns) {
        x = 0;
        y++;
        continue;
      }
      const cell = { x, y, w, h };
      if ([...layout.values()].every((c) => !overlaps(c, cell))) break;
      x++;
    }
    layout.set(tile.key, { x, y, w, h });
    at = { x: x + w, y };
  }
  return layout;
}

/**
 * A layout with one tile put at a cell, and any it lands on pushed down out
 * of its way, those pushing others in turn. Nothing moves up into the room
 * left, so whatever space was left between tiles stays.
 */
export function place(layout: Layout, key: string, cell: Cell): Layout {
  const next: Layout = new Map(layout);
  next.set(key, cell);
  return settle(next, [key]);
}

/**
 * Tiles that overlap pushed down until none do: those named first keep
 * their places, then the rest from the top, each below any it lands on.
 */
function settle(layout: Layout, first: string[] = []): Layout {
  const next: Layout = new Map(layout);
  const settled = [...first];
  const rest = readingOrder(next)
    .map(([k]) => k)
    .filter((k) => !first.includes(k));
  for (const k of rest) {
    let c = next.get(k)!;
    for (;;) {
      const hit = settled
        .map((s) => next.get(s)!)
        .filter((s) => overlaps(s, c));
      if (!hit.length) break;
      c = { ...c, y: Math.max(...hit.map((s) => s.y + s.h)) };
    }
    next.set(k, c);
    settled.push(k);
  }
  return next;
}

/**
 * A layout without the rows nothing's in, those below moving up: for
 * sections, where a row of nothing would only be a wider gap.
 */
export function withoutEmptyRows(layout: Layout): Layout {
  const used = new Set(
    [...layout.values()].flatMap((c) =>
      Array.from({ length: c.h }, (_, i) => c.y + i)
    )
  );
  const above = (y: number) =>
    Array.from({ length: y }, (_, i) => i).filter((i) => used.has(i)).length;
  return new Map(
    [...layout].map(([k, c]) => [k, { ...c, y: above(c.y) }] as const)
  );
}

/** The rows a layout takes up. */
export function rowsOf(layout: Layout) {
  return Math.max(0, ...[...layout.values()].map((c) => c.y + c.h));
}

/**
 * The layout of some tiles at a number of columns: as arranged there, or,
 * if it hasn't been, from the nearest number of columns that has (the wider
 * on a tie), in the same reading order, packed to fit. Tiles placed in
 * neither come after, at their first sizes; ones arranged there since go
 * below what's there.
 */
export function layoutAt(
  keys: { key: string; w: number; h: number }[],
  saved: SavedCell[],
  columns: number
): Layout {
  const wanted = new Set(keys.map((k) => k.key));
  const at = (n: number) =>
    saved.filter((s) => s.columns === n && wanted.has(s.key));

  const here = at(columns);
  if (here.length) {
    const layout: Layout = new Map(here.map((s) => [s.key, fit(s, columns)]));
    // New tiles, such as a container started since, go at the bottom
    let bottom = rowsOf(layout);
    for (const k of keys) {
      if (layout.has(k.key)) continue;
      const cell = fit({ x: 0, y: bottom, w: k.w, h: k.h }, columns);
      layout.set(k.key, cell);
      bottom += cell.h;
    }
    // Two saved on one place, as a tile resized at another width can be,
    // the lower one moves down
    return settle(layout);
  }

  const arranged = [...new Set(saved.map((s) => s.columns))].filter(
    (n) => at(n).length
  );
  const nearest = arranged.sort(
    (a, b) => Math.abs(a - columns) - Math.abs(b - columns) || b - a
  )[0];
  const from: Layout = nearest
    ? new Map(at(nearest).map((s) => [s.key, s]))
    : new Map();
  const ordered = [
    ...readingOrder(from).map(([key, c]) => ({ key, w: c.w, h: c.h })),
    ...keys.filter((k) => !from.has(k.key)),
  ];
  return pack(ordered, columns);
}

/**
 * The columns the one layout every width shares is kept under: not places,
 * but an order, each tile's place in it as its row, and each tile's size.
 */
export const FLOW = 0;

/** A tile in the order every width lays out, at its size. */
export type Flowing = { key: string; w: number; h: number };

/**
 * Some tiles in the order every width lays them out, at their sizes: as
 * arranged, or until they have been, as the old layouts have them at the
 * widest, so nothing moves when this way of arranging starts. Tiles in
 * neither come after, at their first sizes.
 */
export function flowOrder(keys: Flowing[], saved: SavedCell[]): Flowing[] {
  const wanted = new Set(keys.map((k) => k.key));
  const kept = saved
    .filter((s) => s.columns === FLOW && wanted.has(s.key))
    .sort((a, b) => a.y - b.y);
  const ordered: Flowing[] = kept.length
    ? kept.map(({ key, w, h }) => ({ key, w, h }))
    : readingOrder(layoutAt(keys, saved, MAX_COLUMNS)).map(([key, c]) => ({
        key,
        w: c.w,
        h: c.h,
      }));
  const placed = new Set(ordered.map((t) => t.key));
  return [...ordered, ...keys.filter((k) => !placed.has(k.key))];
}

/** Some tiles laid out at a number of columns from the order they share, each as wide as fits. */
export function flowAt(
  keys: Flowing[],
  saved: SavedCell[],
  columns: number
): Layout {
  return pack(flowOrder(keys, saved), columns);
}
