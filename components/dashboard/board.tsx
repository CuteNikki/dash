'use client';

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  type TouchEvent as ReactTouchEvent,
} from 'react';

import { GripHorizontalIcon, GripVerticalIcon } from 'lucide-react';

import {
  COLUMN_BREAKPOINTS,
  COLUMNS_COOKIE,
  columnsFor,
  fit,
  layoutAt,
  MAX_ROWS,
  place,
  readingOrder,
  rowsOf,
  withoutEmptyRows,
  type Cell,
  type Layout,
  type SavedCell,
} from '@/lib/layout';
import { cn } from '@/lib/utils';

/** A tile on the board, drawn by `render` at the place it has. */
export type BoardTile = {
  key: string;
  name: string;
  /** Its size where it hasn't been arranged */
  w: number;
  h: number;
  /** Its content can't be used while arranging, so a press anywhere drags it */
  inert?: boolean;
  render: (cell: Cell) => ReactNode;
};

/**
 * A section of tiles, the server's or a group's, itself placed on the page
 * as a tile is in it: anywhere, as many columns wide as it's made, its
 * tiles in that many columns, and as many rows tall, beside sections
 * stacked as many deep. Tiles move between groups, but not between
 * those and the server's.
 */
export type BoardSection = {
  id: string;
  kind: 'host' | 'group';
  label: string;
  tiles: BoardTile[];
};

export type LayoutChange = {
  /** Where each tile or section that changed now sits, in a grid of so many columns */
  cells: (Cell & { key: string; columns: number })[];
  /** Tiles dragged into another group */
  moved: { key: string; group: string }[];
};

/** How tall a row is taken to be where there's none yet, as the grid's least. */
const ROW_PX = 96;
/** How far a press moves before it's a drag rather than a click. */
const DRAG_PX = 6;
/** How long a finger holds a tile before it's picked up, so a swipe still scrolls. */
const HOLD_MS = 250;
/** How far a finger can wander while holding before it's taken as scrolling. */
const HOLD_SLOP_PX = 8;
/** Sections' keys in the page's layout, apart from their tiles'. */
const SECTION = 'section:';
const PAGE = 'page';

/**
 * The columns the screen has room for, kept in a cookie so the next page the
 * server draws already has them, rather than moving once it's loaded.
 */
export function useColumns(initial: number) {
  const [columns, setColumns] = useState(initial);
  useEffect(() => {
    const queries = COLUMN_BREAKPOINTS.map((b) =>
      matchMedia(`(min-width: ${b}px)`)
    );
    const update = () => {
      const n = columnsFor(innerWidth);
      setColumns(n);
      document.cookie = `${COLUMNS_COOKIE}=${n}; path=/; max-age=31536000; samesite=lax`;
    };
    update();
    queries.forEach((q) => q.addEventListener('change', update));
    return () =>
      queries.forEach((q) => q.removeEventListener('change', update));
  }, []);
  return columns;
}

/** One grid being arranged: its columns, and where its tiles are. */
type Grid = {
  id: string;
  /** What can be dragged between: grids of the same kind */
  kind: string;
  columns: number;
  layout: Layout;
  /**
   * Sections': each row as tall as what ends in it, so none is left empty,
   * and a section moved by where the pointer is rather than its top
   */
  sections?: boolean;
};

type Drag = {
  key: string;
  mode: 'move' | 'resize';
  from: string;
  to: string;
  cell: Cell;
  /** Where the pointer is, and where on the tile it took hold */
  pointer: { x: number; y: number };
  grab: { x: number; y: number };
  /** The tile's size on screen when it was picked up */
  box: { width: number; height: number };
};

/** The cursor everywhere, kept while dragging wherever the pointer goes. */
function setCursor(cursor: string) {
  document.body.style.cursor = cursor;
}

/** A grid's columns and rows on screen, to tell which cell a point is over. */
type Measure = {
  left: number;
  top: number;
  column: number;
  gap: number;
  rowGap: number;
  /** Where each row starts, from the grid's top, with more past the last */
  rowStarts: number[];
};

function measure(grid: HTMLElement, columns: number): Measure {
  const rect = grid.getBoundingClientRect();
  const style = getComputedStyle(grid);
  const gap = parseFloat(style.columnGap) || 0;
  const rowGap = parseFloat(style.rowGap) || 0;
  const tracks =
    style.gridTemplateRows === 'none'
      ? []
      : style.gridTemplateRows.split(' ').map(parseFloat);
  const rowStarts: number[] = [];
  let at = 0;
  for (let i = 0; i < tracks.length + MAX_ROWS + 1; i++) {
    rowStarts.push(at);
    at += (tracks[i] ?? ROW_PX) + rowGap;
  }
  return {
    left: rect.left,
    top: rect.top,
    column: (rect.width - gap * (columns - 1)) / columns,
    gap,
    rowGap,
    rowStarts,
  };
}

/** The row whose top is nearest a point down the grid. */
function nearestRow(m: Measure, y: number) {
  let best = 0;
  m.rowStarts.forEach((start, i) => {
    if (Math.abs(start - y) < Math.abs(m.rowStarts[best] - y)) best = i;
  });
  return best;
}

/**
 * Each section's own height on the page as it changes, by its key, and the
 * gap between the page's rows: what its rows are sized from.
 */
function useSectionHeights() {
  const [heights, setHeights] = useState(new Map<string, number>());
  const [gap, setGap] = useState(0);
  // One observer for them all, made once there's something to watch
  const observer = useRef<ResizeObserver>(null);
  const keys = useRef(new WeakMap<Element, string>());

  const ref = (key: string) => (el: HTMLDivElement | null) => {
    if (!el) return;
    observer.current ??= new ResizeObserver((entries) =>
      setHeights((m) => {
        let next = m;
        for (const e of entries) {
          const k = keys.current.get(e.target);
          const px = e.borderBoxSize[0].blockSize;
          if (k && next.get(k) !== px) next = new Map(next).set(k, px);
        }
        return next;
      })
    );
    keys.current.set(el, key);
    observer.current.observe(el);
    return () => observer.current?.unobserve(el);
  };
  const gridRef = (el: HTMLDivElement | null) => {
    if (el) setGap(parseFloat(getComputedStyle(el).rowGap) || 0);
  };
  return { heights, gap, ref, gridRef };
}

/**
 * The page's rows, each as tall as the tallest section ending in it needs
 * past the rows above that it spans too: so a tall section's extra height
 * goes in its last row, and those stacked beside it sit as close as any,
 * rather than the grid spreading it over every row it spans. Each at least
 * that, and more if what's in it has grown since it was measured. None
 * while every section is a row tall, as the grid sizes those right itself.
 */
function sectionRows(
  layout: Layout,
  heights: Map<string, number>,
  gap: number
) {
  if ([...layout.values()].every((c) => c.h === 1)) return undefined;
  const rows: number[] = [];
  for (let r = 0; r < rowsOf(layout); r++) {
    let row = 0;
    for (const [key, c] of layout) {
      if (c.y + c.h - 1 !== r) continue;
      const above =
        rows.slice(c.y, r).reduce((a, b) => a + b, 0) + gap * (c.h - 1);
      row = Math.max(row, (heights.get(key) ?? 0) - above);
    }
    rows.push(row);
  }
  return rows.map((px) => `minmax(${px}px, auto)`).join(' ');
}

const same = (a: Cell, b: Cell) =>
  a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

/** Every grid's layout with a drag's tile where it's been dragged to. */
function withDrag(grids: Grid[], drag: Drag): Map<string, Layout> {
  const out = new Map(grids.map((g) => [g.id, g.layout]));
  const from: Layout = new Map(out.get(drag.from));
  from.delete(drag.key);
  if (drag.from !== drag.to) out.set(drag.from, from);
  const to: Layout = new Map(drag.from === drag.to ? from : out.get(drag.to));
  out.set(drag.to, place(to, drag.key, drag.cell));
  // Sections leave no empty rows behind them
  for (const g of grids) {
    if (g.sections) out.set(g.id, withoutEmptyRows(out.get(g.id)!));
  }
  return out;
}

/**
 * Dragging tiles about some grids: pressed and moved with a mouse, held
 * then moved with a finger, or from the keyboard. Where one's dragged, the
 * tiles it lands on move down; `onDone` gets the layouts it leaves.
 */
function useArrange(
  grids: Grid[],
  onDone: (layouts: Map<string, Layout>, drag: Drag) => void
) {
  const els = useRef(new Map<string, HTMLDivElement>());
  const [drag, setDrag] = useState<Drag>();
  const shown = drag
    ? withDrag(grids, drag)
    : new Map(grids.map((g) => [g.id, g.layout]));

  const gridOf = (key: string) => grids.find((g) => g.layout.has(key))!;

  /** Follows the pointer from a press on a tile, its handle or its corner. */
  function track(
    key: string,
    mode: Drag['mode'],
    start: { x: number; y: number },
    node: HTMLElement
  ) {
    const grid = gridOf(key);
    const from = grid.layout.get(key)!;
    const rect = node.getBoundingClientRect();
    // Measured as it starts, so the grid moving under it doesn't move its rows
    const startMeasure = new Map(
      grids.flatMap((g) => {
        const el = els.current.get(g.id);
        return el ? [[g.id, measure(el, g.columns)] as const] : [];
      })
    );
    // Where each grid of its kind was, on the page rather than the screen so
    // scrolling doesn't move them: one growing to take a tile can't then
    // draw the pointer to it
    const startBoxes = grids.flatMap((g) => {
      const el = els.current.get(g.id);
      if (g.kind !== grid.kind || !el) return [];
      const r = el.getBoundingClientRect();
      return [
        {
          grid: g,
          left: r.left + scrollX,
          right: r.right + scrollX,
          top: r.top + scrollY,
          // Half a row past its last, to drop a tile below it
          bottom: r.bottom + scrollY + ROW_PX / 2,
        },
      ];
    });
    let current: Drag = {
      key,
      mode,
      from: grid.id,
      to: grid.id,
      cell: from,
      pointer: start,
      grab: { x: start.x - rect.left, y: start.y - rect.top },
      box: { width: rect.width, height: rect.height },
    };

    const moveTo = (x: number, y: number) => {
      if (mode === 'resize') {
        const m = startMeasure.get(grid.id)!;
        const right = rect.right + x - start.x - m.left;
        const bottom = rect.bottom + y - start.y - m.top;
        const w = Math.round(
          (right - from.x * (m.column + m.gap) + m.gap) / (m.column + m.gap)
        );
        // As many rows as ends nearest the pointer
        let h = 1;
        for (let n = 1; n <= MAX_ROWS; n++) {
          const end = (m.rowStarts[from.y + n] ?? 0) - m.rowGap;
          const best = (m.rowStarts[from.y + h] ?? 0) - m.rowGap;
          if (Math.abs(end - bottom) < Math.abs(best - bottom)) h = n;
        }
        current = {
          ...current,
          pointer: { x, y },
          cell: fit(
            { ...from, w: Math.min(w, grid.columns - from.x), h },
            grid.columns
          ),
        };
      } else {
        // Into the grid the pointer's over, or the nearest one to it
        let to = grid;
        let distance = Infinity;
        const px = x + scrollX;
        const py = y + scrollY;
        for (const b of startBoxes) {
          const dx = Math.max(b.left - px, 0, px - b.right);
          const dy = Math.max(b.top - py, 0, py - b.bottom);
          const d = Math.hypot(dx, dy);
          if (d < distance) {
            distance = d;
            to = b.grid;
          }
        }
        const m =
          to.id === grid.id
            ? startMeasure.get(to.id)!
            : measure(els.current.get(to.id)!, to.columns);
        current = {
          ...current,
          to: to.id,
          pointer: { x, y },
          cell: fit(
            {
              x: Math.round((x - current.grab.x - m.left) / (m.column + m.gap)),
              y: grid.sections
                ? nearestRow(m, y - m.top)
                : nearestRow(m, y - current.grab.y - m.top),
              w: from.w,
              h: from.h,
            },
            to.columns
          ),
        };
      }
      setDrag(current);
    };

    const finish = () => {
      if (current.from !== current.to || !same(current.cell, from)) {
        onDone(withDrag(grids, current), current);
      }
      setDrag(undefined);
      // The press that ended a drag isn't also a click on the tile
      const swallow = (e: Event) => e.stopPropagation();
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, true));
    };

    return { begin: () => setDrag(current), moveTo, finish };
  }

  /** A press with a mouse or pen, a drag once it's moved a little; from a handle, at once. */
  function press(
    e: ReactPointerEvent,
    key: string,
    mode: Drag['mode'],
    node: HTMLElement,
    at: number = DRAG_PX
  ) {
    if (e.button !== 0) return;
    // A finger holds a tile to pick it up, except by its handle or corner
    if (e.pointerType === 'touch' && at > 0) return;
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY };
    const t = track(key, mode, start, node);
    let dragging = false;
    if (at === 0) {
      e.preventDefault();
      dragging = true;
      t.begin();
    }
    const move = (m: PointerEvent) => {
      if (!dragging) {
        if (Math.hypot(m.clientX - start.x, m.clientY - start.y) < at) return;
        dragging = true;
        t.begin();
      }
      t.moveTo(m.clientX, m.clientY);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      setCursor('');
      if (dragging) t.finish();
    };
    setCursor(mode === 'resize' ? 'nwse-resize' : at === 0 ? 'grabbing' : '');
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  /** A finger holding a tile: a drag once it's held still a moment. */
  function hold(e: ReactTouchEvent, key: string, node: HTMLElement) {
    const touch = e.touches[0];
    if (!touch || e.touches.length > 1) return;
    const start = { x: touch.clientX, y: touch.clientY };
    const t = track(key, 'move', start, node);
    let dragging = false;
    const timer = setTimeout(() => {
      dragging = true;
      t.begin();
      navigator.vibrate?.(10);
    }, HOLD_MS);
    const move = (m: TouchEvent) => {
      const p = m.touches[0];
      if (!dragging) {
        if (
          Math.hypot(p.clientX - start.x, p.clientY - start.y) > HOLD_SLOP_PX
        ) {
          end();
        }
        return;
      }
      // Holding a tile, the page doesn't scroll
      m.preventDefault();
      t.moveTo(p.clientX, p.clientY);
    };
    const end = () => {
      clearTimeout(timer);
      window.removeEventListener('touchmove', move);
      window.removeEventListener('touchend', end);
      window.removeEventListener('touchcancel', end);
      if (dragging) t.finish();
    };
    window.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);
    window.addEventListener('touchcancel', end);
  }

  /** The arrow keys on a handle move a tile a cell; with Shift they resize it. */
  function nudge(e: ReactKeyboardEvent, key: string) {
    const step = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[e.key];
    if (!step) return;
    e.preventDefault();
    const grid = gridOf(key);
    const c = grid.layout.get(key)!;
    const [dx, dy] = step;
    const cell = fit(
      e.shiftKey
        ? {
            ...c,
            w: Math.min(c.w + dx, grid.columns - c.x),
            h: c.h + dy,
          }
        : { ...c, x: c.x + dx, y: c.y + dy },
      grid.columns
    );
    if (same(cell, c)) return;
    const d: Drag = {
      key,
      mode: 'move',
      from: grid.id,
      to: grid.id,
      cell,
      pointer: { x: 0, y: 0 },
      grab: { x: 0, y: 0 },
      box: { width: 0, height: 0 },
    };
    onDone(withDrag(grids, d), d);
  }

  const ref = (id: string) => (el: HTMLDivElement | null) => {
    if (el) els.current.set(id, el);
    else els.current.delete(id);
  };

  return { drag, shown, press, hold, nudge, ref };
}

/**
 * The server's section and the groups', placed on the page as tiles are in
 * them. While editing, a section's dragged by the handle beside its name,
 * anywhere, beside another one if there's room, and resized by the one at
 * its heading's end: wider or narrower, or taller, to span the rows of the
 * sections stacked beside it; a tile's dragged anywhere in its section
 * or into another group, leaving room where it was, and resized by its
 * corner. The tiles or sections something lands on move down. The keyboard
 * does all of it from a handle: the arrow keys move, with Shift resize.
 */
export function Board({
  sections,
  columns,
  editing,
  saved,
  onLayout,
  onRename,
}: {
  sections: BoardSection[];
  columns: number;
  editing: boolean;
  saved: SavedCell[];
  onLayout: (change: LayoutChange) => void;
  /** A group renamed while editing */
  onRename: (section: BoardSection, name: string) => void;
}) {
  // Each section full width, one under another, until they're arranged
  const page = useArrange(
    [
      {
        id: PAGE,
        kind: PAGE,
        columns,
        sections: true,
        layout: withoutEmptyRows(
          layoutAt(
            sections.map((s) => ({ key: SECTION + s.id, w: columns, h: 1 })),
            saved,
            columns
          )
        ),
      },
    ],
    (layouts) =>
      onLayout({
        cells: [...layouts.get(PAGE)!].map(([key, c]) => ({
          key,
          columns,
          ...c,
        })),
        moved: [],
      })
  );
  const placed = page.shown.get(PAGE)!;
  const heights = useSectionHeights();

  // A section's tiles in as many columns as it's wide
  const grids: Grid[] = sections.map((s) => {
    const width = placed.get(SECTION + s.id)?.w ?? columns;
    return {
      id: s.id,
      kind: s.kind,
      columns: width,
      layout: layoutAt(
        s.tiles.map((t) => ({ key: t.key, w: t.w, h: t.h })),
        saved,
        width
      ),
    };
  });
  const tiles = useArrange(grids, (layouts, d) => {
    const to = sections.find((s) => s.id === d.to)!;
    onLayout({
      cells: [...new Set([d.from, d.to])].flatMap((id) => {
        const n = grids.find((g) => g.id === id)!.columns;
        return [...layouts.get(id)!].map(([key, c]) => ({
          key,
          columns: n,
          ...c,
        }));
      }),
      moved:
        d.from !== d.to && to.kind === 'group'
          ? [{ key: d.key, group: to.label }]
          : [],
    });
  });

  const tileByKey = new Map(
    sections.flatMap((s) => s.tiles.map((t) => [t.key, t] as const))
  );
  const sectionByKey = new Map(sections.map((s) => [SECTION + s.id, s]));

  /** A section's tiles in their grid: arranged while editing, or as they are. */
  function tileGrid(section: BoardSection, arranging: boolean) {
    const grid = grids.find((g) => g.id === section.id)!;
    const layout = tiles.shown.get(section.id) ?? new Map();
    const d = tiles.drag;
    const keys = readingOrder(layout).map(([k]) => k);
    return (
      <TileGrid
        columns={grid.columns}
        // Room below the last row of the grid a tile's dragged over, to drop it there
        extraRow={
          arranging && d?.mode === 'move' && d.to === section.id
            ? rowsOf(layout) + 1
            : undefined
        }
        empty={!keys.length}
        ref={arranging ? tiles.ref(section.id) : undefined}
      >
        {keys.map((key) => {
          const tile = tileByKey.get(key);
          const cell = layout.get(key)!;
          if (!tile) return null;
          return (
            <GridCell key={key} cell={cell}>
              {arranging && d?.key === key && d.mode === 'move' ? (
                <DropPlace />
              ) : arranging ? (
                <EditTile
                  name={tile.name}
                  cell={cell}
                  inert={tile.inert}
                  resizing={d?.key === key && d.mode === 'resize'}
                  onPress={(e, mode, node, at) =>
                    tiles.press(e, key, mode, node, at)
                  }
                  onHold={(e, node) => tiles.hold(e, key, node)}
                  onNudge={(e) => tiles.nudge(e, key)}
                >
                  {tile.render(cell)}
                </EditTile>
              ) : (
                tile.render(cell)
              )}
            </GridCell>
          );
        })}
      </TileGrid>
    );
  }

  const pd = page.drag;
  const td = tiles.drag;
  const draggedTile = td && tileByKey.get(td.key);
  const draggedSection = pd && sectionByKey.get(pd.key);

  return (
    <>
      <div
        ref={(el) => {
          page.ref(PAGE)(el);
          heights.gridRef(el);
        }}
        // Sections' columns line up with the page's, so their tiles are as
        // wide in a narrow section as a wide one
        className='grid gap-x-3 gap-y-8'
        style={{
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gridTemplateRows: sectionRows(placed, heights.heights, heights.gap),
        }}
      >
        {readingOrder(placed).map(([key, cell]) => {
          const section = sectionByKey.get(key);
          if (!section) return null;
          return (
            <GridCell key={key} cell={cell} top>
              {/* As tall as it is, not as its rows, to measure them by */}
              <div ref={heights.ref(key)} className='grid min-w-0 grid-cols-1'>
                {pd?.key === key && pd.mode === 'move' ? (
                  <DropPlace height={pd.box.height} />
                ) : (
                  <SectionBlock
                    section={section}
                    editing={editing}
                    resizing={pd?.key === key && pd.mode === 'resize'}
                    cell={cell}
                    onPress={(e, mode, node) =>
                      page.press(e, key, mode, node, 0)
                    }
                    onNudge={(e) => page.nudge(e, key)}
                    onRename={(name) => onRename(section, name)}
                  >
                    {tileGrid(section, editing)}
                  </SectionBlock>
                )}
              </div>
            </GridCell>
          );
        })}
        {/* Room below the last section while one's dragged, to drop it there */}
        {pd?.mode === 'move' && (
          <div
            aria-hidden
            className='h-24'
            style={{ gridColumn: 1, gridRow: rowsOf(placed) + 1 }}
          />
        )}
      </div>

      {/* What's dragged, under the pointer */}
      {td && draggedTile && td.mode === 'move' && (
        <Floating drag={td}>{draggedTile.render(td.cell)}</Floating>
      )}
      {draggedSection && pd.mode === 'move' && (
        <Floating drag={pd} section>
          <SectionBlock section={draggedSection} editing={false} cell={pd.cell}>
            {tileGrid(draggedSection, false)}
          </SectionBlock>
        </Floating>
      )}
    </>
  );
}

/**
 * What's dragged, under the pointer: a tile, raised by a shadow, or a
 * section, its heading and tiles alone, each tile raised, without the room
 * a taller section beside it gave it.
 */
function Floating({
  drag,
  section,
  children,
}: {
  drag: Drag;
  section?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'pointer-events-none fixed z-50 grid cursor-grabbing grid-cols-1 rounded-lg',
        section ? '**:data-[slot=card]:shadow-lg' : 'shadow-lg'
      )}
      style={{
        left: drag.pointer.x - drag.grab.x,
        top: drag.pointer.y - drag.grab.y,
        width: drag.box.width,
        height: section ? undefined : drag.box.height,
      }}
    >
      {children}
    </div>
  );
}

/** Where a dragged tile or section will land. */
function DropPlace({ height }: { height?: number }) {
  return (
    <div
      className='min-h-24 rounded-lg border-2 border-dashed border-primary/50 bg-primary/5'
      // A section's as tall as it is; a tile's, as its rows
      style={{ height }}
    />
  );
}

function TileGrid({
  columns,
  extraRow,
  empty,
  ref,
  children,
}: {
  columns: number;
  /** A row to keep room for, empty */
  extraRow?: number;
  empty: boolean;
  ref?: (el: HTMLDivElement | null) => void;
  children: ReactNode;
}) {
  return (
    <div
      ref={ref}
      className={cn(
        // Each row at least a tile's height, so a taller tile is that many
        // tall; columns all as wide, whatever's in them
        'grid auto-rows-[minmax(6rem,auto)] gap-3',
        // Room to drop onto once a group's last tile has left it
        empty && 'min-h-24 rounded-lg border border-dashed'
      )}
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {children}
      {extraRow && !empty && (
        <div aria-hidden style={{ gridColumn: 1, gridRow: extraRow }} />
      )}
    </div>
  );
}

function GridCell({
  cell,
  top,
  children,
}: {
  cell: Cell;
  /** What's in it at its top, as tall as it is, rather than filling its rows */
  top?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      // One column its own width, whatever its tile holds
      className={cn('grid min-w-0 grid-cols-1', top && 'items-start')}
      style={{
        gridColumn: `${cell.x + 1} / span ${cell.w}`,
        gridRow: `${cell.y + 1} / span ${cell.h}`,
      }}
    >
      {children}
    </div>
  );
}

/**
 * A section: its heading, and its tiles. While editing, handles at the
 * heading's end drag and resize it, laid over the line rather than in it,
 * so it's as tall as when not editing.
 */
function SectionBlock({
  section,
  editing,
  resizing,
  cell,
  onPress,
  onNudge,
  onRename,
  children,
}: {
  section: BoardSection;
  editing: boolean;
  resizing?: boolean;
  /** Its place, its columns and rows shown while it's resized */
  cell: Cell;
  onPress?: (
    e: ReactPointerEvent,
    mode: Drag['mode'],
    node: HTMLElement
  ) => void;
  onNudge?: (e: ReactKeyboardEvent) => void;
  onRename?: (name: string) => void;
  children: ReactNode;
}) {
  const node = useRef<HTMLElement>(null);
  const arranging = editing && onPress && onNudge;
  return (
    <section
      ref={node}
      aria-label={section.label}
      className={cn(
        'relative flex min-w-0 flex-col gap-3 rounded-lg',
        resizing && 'ring-2 ring-primary ring-offset-4 ring-offset-background'
      )}
    >
      <h2 className='relative flex items-center text-xs font-medium tracking-wide text-muted-foreground uppercase'>
        <span className='relative flex items-center gap-2'>
          {arranging && onRename && section.kind === 'group' ? (
            <GroupName name={section.label} onRename={onRename} />
          ) : (
            section.label
          )}
          {section.kind === 'group' && (
            <span className='font-mono tracking-normal tabular-nums'>
              {section.tiles.length}
            </span>
          )}
        </span>
        {arranging && (
          <span className='absolute top-1/2 right-0 flex -translate-y-1/2 items-center gap-0.5'>
            {resizing && (
              <span className='mr-1 rounded-md bg-primary px-1.5 font-mono text-xs/5 tracking-normal whitespace-nowrap text-primary-foreground normal-case tabular-nums'>
                {cell.w} × {cell.h}
              </span>
            )}
            <button
              type='button'
              aria-label={`Move ${section.label}: arrow keys move it, with Shift they resize it`}
              className='cursor-grab touch-none rounded-sm p-0.5 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring'
              onPointerDown={(e) => onPress(e, 'move', node.current!)}
              onKeyDown={onNudge}
            >
              <GripVerticalIcon className='size-4' />
            </button>
            <button
              type='button'
              tabIndex={-1}
              aria-hidden
              title='Drag to resize: wider or narrower, or down beside the sections next to it'
              className='cursor-nwse-resize touch-none rounded-sm p-0.5 hover:text-foreground'
              onPointerDown={(e) => onPress(e, 'resize', node.current!)}
            >
              {/* Arrows out to opposite corners */}
              <svg viewBox='0 0 16 16' className='size-4' aria-hidden>
                <path
                  d='M3 3l10 10M3 3h4M3 3v4M13 13H9M13 13V9'
                  fill='none'
                  stroke='currentColor'
                  strokeWidth='1.3'
                  strokeLinecap='round'
                  strokeLinejoin='round'
                />
              </svg>
            </button>
          </span>
        )}
      </h2>
      {children}
    </section>
  );
}

/** A tile while arranging: pressed to drag, a tab to drag it by, a corner to resize it. */
function EditTile({
  name,
  cell,
  inert,
  resizing,
  onPress,
  onHold,
  onNudge,
  children,
}: {
  name: string;
  cell: Cell;
  inert?: boolean;
  resizing: boolean;
  onPress: (
    e: ReactPointerEvent,
    mode: Drag['mode'],
    node: HTMLElement,
    at?: number
  ) => void;
  onHold: (e: ReactTouchEvent, node: HTMLElement) => void;
  onNudge: (e: ReactKeyboardEvent) => void;
  children: ReactNode;
}) {
  const node = useRef<HTMLDivElement>(null);
  return (
    <div
      ref={node}
      className={cn(
        'relative grid cursor-grab grid-cols-1 rounded-lg select-none',
        resizing && 'z-10 ring-2 ring-primary'
      )}
      onPointerDown={(e) => onPress(e, 'move', node.current!)}
      onTouchStart={(e) => onHold(e, node.current!)}
      // A long press picks it up rather than opening a menu
      onContextMenu={(e) => e.preventDefault()}
    >
      <div inert={inert} className='grid grid-cols-1'>
        {children}
      </div>
      <button
        type='button'
        aria-label={`Move ${name}: arrow keys move it, with Shift they resize it`}
        // A tab on its top edge, clear of whatever the tile shows
        className='absolute -top-2 left-1/2 -translate-x-1/2 cursor-grab touch-none rounded-full bg-card px-1.5 text-muted-foreground ring-1 ring-foreground/10 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring'
        onPointerDown={(e) => onPress(e, 'move', node.current!, 0)}
        onTouchStart={(e) => e.stopPropagation()}
        onKeyDown={onNudge}
      >
        <GripHorizontalIcon className='size-4' />
      </button>
      <button
        type='button'
        tabIndex={-1}
        aria-hidden
        title='Drag to resize'
        // A knob on its corner, clear of whatever the tile shows
        className='absolute -right-2 -bottom-2 flex size-5 cursor-nwse-resize touch-none items-center justify-center rounded-full bg-card text-muted-foreground ring-1 ring-foreground/10 hover:text-foreground'
        onPointerDown={(e) => onPress(e, 'resize', node.current!, 0)}
        onTouchStart={(e) => e.stopPropagation()}
      >
        {/* Two lines across the corner */}
        <svg viewBox='0 0 8 8' className='size-2.5' aria-hidden>
          <path
            d='M7 1 1 7M7 4.5 4.5 7'
            stroke='currentColor'
            strokeWidth='1.2'
            strokeLinecap='round'
          />
        </svg>
      </button>
      {/* Its size as it's resized, in columns and rows */}
      {resizing && (
        <span className='pointer-events-none absolute right-4 bottom-1.5 rounded-md bg-primary px-1.5 font-mono text-xs/5 text-primary-foreground tabular-nums'>
          {cell.w} × {cell.h}
        </span>
      )}
    </div>
  );
}

/**
 * A group's name as a field, in the heading's own type and no taller, so
 * renaming it moves nothing: saved on Enter or leaving it, put back on
 * Escape or if it's left empty.
 */
function GroupName({
  name,
  onRename,
}: {
  name: string;
  onRename: (name: string) => void;
}) {
  const [value, setValue] = useState(name);
  // A rename saved, or made elsewhere, shows here
  const [shown, setShown] = useState(name);
  if (shown !== name) {
    setShown(name);
    setValue(name);
  }

  function commit() {
    const next = value.trim();
    if (next && next !== name) onRename(next);
    else setValue(name);
  }

  return (
    <input
      aria-label={`Rename ${name}`}
      value={value}
      maxLength={60}
      spellCheck={false}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setValue(name);
          // Left once it's as it was, so leaving it saves nothing
          const field = e.currentTarget;
          requestAnimationFrame(() => field.blur());
        }
      }}
      className='field-sizing-content h-4 min-w-8 rounded-none border-b border-dashed border-foreground/30 bg-transparent p-0 leading-4 tracking-wide text-foreground uppercase outline-none hover:border-foreground/60 focus:border-solid focus:border-primary'
    />
  );
}
