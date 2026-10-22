'use client';

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  useEffect,
  useMemo,
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
 * A grid of tiles: the server's, first, without a heading, or a group's.
 * Tiles move between groups, but not between those and the server's.
 */
export type BoardSection = {
  id: string;
  kind: 'host' | 'group';
  label: string;
  tiles: BoardTile[];
};

export type LayoutChange = {
  /** Where each tile in the grids that changed now sits */
  cells: (Cell & { key: string })[];
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
 * The server's tiles and the groups of services, each a grid at this
 * number of columns. While editing, a tile is dragged anywhere in its grid,
 * leaving room where it was, or into another group; the tiles it lands on
 * move down. Its corner resizes it, and the keyboard does both from its
 * handle: the arrow keys move it, with Shift they resize it.
 */
export function Board({
  sections,
  columns,
  editing,
  saved,
  onLayout,
  onGroups,
}: {
  sections: BoardSection[];
  columns: number;
  editing: boolean;
  saved: SavedCell[];
  onLayout: (change: LayoutChange) => void;
  onGroups: (names: string[]) => void;
}) {
  const layouts = useMemo(
    () =>
      new Map(
        sections.map((s) => [
          s.id,
          layoutAt(
            s.tiles.map((t) => ({ key: t.key, w: t.w, h: t.h })),
            saved,
            columns
          ),
        ])
      ),
    [sections, saved, columns]
  );
  const tiles = new Map(
    sections.flatMap((s) => s.tiles.map((t) => [t.key, t] as const))
  );
  const grids = useRef(new Map<string, HTMLDivElement>());
  const [drag, setDrag] = useState<Drag>();
  // Measured as a drag starts, so the grid moving under it doesn't move its rows
  const measured = useRef(new Map<string, Measure>());

  /** The layouts with the dragged tile where it's being dragged to. */
  const shown = useMemo(() => {
    if (!drag) return layouts;
    const out = new Map(layouts);
    const from: Layout = new Map(layouts.get(drag.from));
    if (drag.from !== drag.to) {
      from.delete(drag.key);
      out.set(drag.from, from);
    }
    const to: Layout = new Map(layouts.get(drag.to));
    to.delete(drag.key);
    out.set(drag.to, place(to, drag.key, drag.cell));
    return out;
  }, [layouts, drag]);

  function sectionOf(key: string) {
    return sections.find((s) => s.tiles.some((t) => t.key === key))!;
  }

  function save(final: Map<string, Layout>, d: Drag) {
    const changed = [...new Set([d.from, d.to])];
    const to = sections.find((s) => s.id === d.to)!;
    onLayout({
      cells: changed.flatMap((id) =>
        [...(final.get(id) ?? [])].map(([key, c]) => ({ key, ...c }))
      ),
      moved:
        d.from !== d.to && to.kind === 'group'
          ? [{ key: d.key, group: to.label }]
          : [],
    });
  }

  /** Follows the pointer from a press on a tile, its handle or its corner. */
  function track(
    key: string,
    mode: Drag['mode'],
    start: { x: number; y: number },
    node: HTMLElement
  ) {
    const section = sectionOf(key);
    const from = layouts.get(section.id)!.get(key)!;
    const rect = node.getBoundingClientRect();
    measured.current = new Map(
      [...grids.current].map(([id, el]) => [id, measure(el, columns)])
    );
    let current: Drag = {
      key,
      mode,
      from: section.id,
      to: section.id,
      cell: from,
      pointer: start,
      grab: { x: start.x - rect.left, y: start.y - rect.top },
      box: { width: rect.width, height: rect.height },
    };

    const moveTo = (x: number, y: number) => {
      if (mode === 'resize') {
        const m = measured.current.get(current.from)!;
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
          cell: fit({ ...from, w: Math.min(w, columns - from.x), h }, columns),
        };
      } else {
        // Over the grid of the same kind the pointer's nearest
        const kind = section.kind;
        let to = current.to;
        let distance = Infinity;
        for (const s of sections) {
          if (s.kind !== kind) continue;
          const el = grids.current.get(s.id);
          if (!el) continue;
          const r = el.getBoundingClientRect();
          const d =
            y < r.top
              ? r.top - y
              : y > r.bottom + ROW_PX
                ? y - r.bottom - ROW_PX
                : 0;
          if (d < distance) {
            distance = d;
            to = s.id;
          }
        }
        const m = measure(grids.current.get(to)!, columns);
        const left = x - current.grab.x - m.left;
        const top = y - current.grab.y - m.top;
        current = {
          ...current,
          to,
          pointer: { x, y },
          cell: fit(
            {
              x: Math.round(left / (m.column + m.gap)),
              y: nearestRow(
                to === current.from ? measured.current.get(to)! : m,
                top
              ),
              w: from.w,
              h: from.h,
            },
            columns
          ),
        };
      }
      setDrag(current);
    };

    const finish = () => {
      const out = new Map(layouts);
      const fromLayout: Layout = new Map(layouts.get(current.from));
      fromLayout.delete(current.key);
      if (current.from !== current.to) out.set(current.from, fromLayout);
      const toLayout: Layout = new Map(
        current.from === current.to ? fromLayout : layouts.get(current.to)
      );
      out.set(current.to, place(toLayout, current.key, current.cell));
      const before = layouts.get(current.from)!.get(current.key)!;
      const unchanged =
        current.from === current.to &&
        (['x', 'y', 'w', 'h'] as const).every(
          (k) => current.cell[k] === before[k]
        );
      if (!unchanged) save(out, current);
      setDrag(undefined);
      // The press that ended a drag isn't also a click on the tile
      const swallow = (e: Event) => e.stopPropagation();
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, true));
    };

    return { begin: () => setDrag(current), moveTo, finish };
  }

  /** A press with a mouse or pen: a drag once it's moved a little. */
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

  /** The arrow keys on a tile's handle move it a cell; with Shift they resize it. */
  function nudge(e: ReactKeyboardEvent, key: string) {
    const step = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1],
    }[e.key];
    if (!step) return;
    e.preventDefault();
    const section = sectionOf(key);
    const layout = layouts.get(section.id)!;
    const c = layout.get(key)!;
    const [dx, dy] = step;
    const cell = fit(
      e.shiftKey
        ? { ...c, w: Math.min(c.w + dx, columns - c.x), h: c.h + dy }
        : { ...c, x: c.x + dx, y: c.y + dy },
      columns
    );
    if ((['x', 'y', 'w', 'h'] as const).every((k) => cell[k] === c[k])) return;
    const final = new Map(layouts);
    final.set(section.id, place(layout, key, cell));
    save(final, {
      key,
      mode: 'move',
      from: section.id,
      to: section.id,
      cell,
      pointer: { x: 0, y: 0 },
      grab: { x: 0, y: 0 },
      box: { width: 0, height: 0 },
    });
  }

  const host = sections.filter((s) => s.kind === 'host');
  const groups = sections.filter((s) => s.kind === 'group');
  const dragged = drag && tiles.get(drag.key);

  function grid(section: BoardSection) {
    const layout = shown.get(section.id) ?? new Map();
    // A tile dragged in from another group is drawn here
    const keys = readingOrder(layout).map(([k]) => k);
    return (
      <SectionGrid
        key={section.id}
        columns={columns}
        // Room below the last row of the grid a tile's dragged over, to drop it there
        extraRow={
          drag?.mode === 'move' && drag.to === section.id
            ? rowsOf(layout) + 1
            : undefined
        }
        empty={!keys.length}
        ref={(el) => {
          if (el) grids.current.set(section.id, el);
          else grids.current.delete(section.id);
        }}
      >
        {keys.map((key) => {
          const tile = tiles.get(key);
          const cell = layout.get(key)!;
          if (!tile) return null;
          const moving = drag?.key === key && drag.mode === 'move';
          return (
            <GridCell key={key} cell={cell}>
              {moving ? (
                // Where it'll land
                <div className='rounded-lg border-2 border-dashed border-primary/50 bg-primary/5' />
              ) : editing ? (
                <EditTile
                  tile={tile}
                  cell={cell}
                  resizing={drag?.key === key && drag.mode === 'resize'}
                  onPress={(e, mode, node, at) => press(e, key, mode, node, at)}
                  onHold={(e, node) => hold(e, key, node)}
                  onNudge={(e) => nudge(e, key)}
                />
              ) : (
                tile.render(cell)
              )}
            </GridCell>
          );
        })}
      </SectionGrid>
    );
  }

  return (
    <>
      {host.map((s) => (
        <section key={s.id} aria-label={s.label}>
          {grid(s)}
        </section>
      ))}
      <Groups
        groups={groups}
        editing={editing}
        onGroups={onGroups}
        renderGrid={grid}
      />
      {dragged && drag.mode === 'move' && (
        // The tile itself, under the pointer
        <div
          className='pointer-events-none fixed z-50 grid cursor-grabbing grid-cols-1 rounded-lg shadow-lg'
          style={{
            left: drag.pointer.x - drag.grab.x,
            top: drag.pointer.y - drag.grab.y,
            width: drag.box.width,
            height: drag.box.height,
          }}
        >
          {dragged.render(drag.cell)}
        </div>
      )}
    </>
  );
}

function SectionGrid({
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
  ref: (el: HTMLDivElement | null) => void;
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

function GridCell({ cell, children }: { cell: Cell; children: ReactNode }) {
  return (
    <div
      // One column its own width, whatever its tile holds
      className='grid min-w-0 grid-cols-1'
      style={{
        gridColumn: `${cell.x + 1} / span ${cell.w}`,
        gridRow: `${cell.y + 1} / span ${cell.h}`,
      }}
    >
      {children}
    </div>
  );
}

/** A tile while arranging: pressed to drag, a tab to drag it by, a corner to resize it. */
function EditTile({
  tile,
  cell,
  resizing,
  onPress,
  onHold,
  onNudge,
}: {
  tile: BoardTile;
  cell: Cell;
  resizing: boolean;
  onPress: (
    e: ReactPointerEvent,
    mode: Drag['mode'],
    node: HTMLElement,
    at?: number
  ) => void;
  onHold: (e: ReactTouchEvent, node: HTMLElement) => void;
  onNudge: (e: ReactKeyboardEvent) => void;
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
      <div inert={tile.inert} className='grid grid-cols-1'>
        {tile.render(cell)}
      </div>
      <button
        type='button'
        aria-label={`Move ${tile.name}: arrow keys move it, with Shift they resize it`}
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

const GROUP_ID = 'group:';

/** The groups, in order; while editing, each dragged by its heading's handle. */
function Groups({
  groups,
  editing,
  onGroups,
  renderGrid,
}: {
  groups: BoardSection[];
  editing: boolean;
  onGroups: (names: string[]) => void;
  renderGrid: (section: BoardSection) => ReactNode;
}) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  const [active, setActive] = useState<string>();
  const ids = groups.map((g) => GROUP_ID + g.label);

  function onDragEnd({ active, over }: DragEndEvent) {
    setActive(undefined);
    if (!over || active.id === over.id) return;
    const names = groups.map((g) => g.label);
    onGroups(
      arrayMove(
        names,
        ids.indexOf(String(active.id)),
        ids.indexOf(String(over.id))
      )
    );
  }

  const dragged = groups.find((g) => GROUP_ID + g.label === active);
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={({ active }) => setActive(String(active.id))}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActive(undefined)}
    >
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        <div className='flex flex-col gap-8'>
          {groups.map((group) => (
            <GroupSection key={group.id} group={group} editing={editing}>
              {renderGrid(group)}
            </GroupSection>
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {dragged && (
          <div className='w-fit rounded-md bg-background px-2 py-1 shadow-md ring-1 ring-foreground/10'>
            <GroupHeading name={dragged.label} count={dragged.tiles.length} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}

/**
 * A group's name and how many it has, as tall while editing as not: the
 * handle to drag it by sits at the end of the line, not in it.
 */
function GroupHeading({
  name,
  count,
  handle,
}: {
  name: string;
  count: number;
  handle?: ReactNode;
}) {
  return (
    <h2 className='relative flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase'>
      {name}
      <span className='font-mono tracking-normal tabular-nums'>{count}</span>
      {handle}
    </h2>
  );
}

function GroupSection({
  group,
  editing,
  children,
}: {
  group: BoardSection;
  editing: boolean;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: GROUP_ID + group.label, disabled: !editing });
  return (
    <section
      ref={setNodeRef}
      aria-label={group.label}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-dragging={isDragging}
      className='flex flex-col gap-3 data-[dragging=true]:opacity-40'
    >
      <GroupHeading
        name={group.label}
        count={group.tiles.length}
        handle={
          editing && (
            <button
              type='button'
              ref={setActivatorNodeRef}
              aria-label={`Drag to move ${group.label}`}
              className='absolute top-1/2 right-0 -translate-y-1/2 cursor-grab touch-none rounded-sm p-0.5 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing'
              {...attributes}
              {...listeners}
            >
              <GripVerticalIcon className='size-4' />
            </button>
          )
        }
      />
      {children}
    </section>
  );
}
