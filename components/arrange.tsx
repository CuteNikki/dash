'use client';

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragOverEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import {
  useRef,
  useState,
  type KeyboardEventHandler,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { GripHorizontalIcon } from 'lucide-react';

import { MAX_HEIGHT, MAX_WIDTH, spanClasses } from '@/lib/tile-size';
import { cn } from '@/lib/utils';

/** The grid tiles sit in: the server's stats and each group's services. */
export const TILE_GRID =
  // Each row at least a tile's height, so a taller tile is that many tall
  'grid auto-rows-[minmax(6rem,auto)] grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

export type TileSize = { width: number; height: number };

/** A tile in its grid, as wide and tall as its size; its content fills it. */
export function GridTile({
  size,
  children,
}: {
  size: TileSize;
  children: ReactNode;
}) {
  return (
    <div className={cn('grid', spanClasses(size.width, size.height))}>
      {children}
    </div>
  );
}

/** Dragging that still lets a click through, and a press on a phone scroll. */
export function useArrangeSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
}

/** No transforms: the grid itself moves tiles out of the way. */
export const inPlace = () => null;

/**
 * A tile being arranged: pressed anywhere to drag it, or moved by keyboard
 * from its handle (Space, the arrow keys, Space); its corner resizes it a
 * whole column or row at a time, ringed and showing its size meanwhile.
 */
export function ArrangeTile({
  id,
  name,
  size,
  inertContent,
  onResize,
  children,
}: {
  id: string;
  name: string;
  size: TileSize;
  /** Its content can't be used while arranging, so a press anywhere drags it */
  inertContent?: boolean;
  onResize: (size: TileSize) => void;
  /** Drawn at the size it's being resized to */
  children: (size: TileSize) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } =
    useSortable({ id, data: { type: 'tile' } });
  // Pressing anywhere drags it; the keyboard, only from its handle, so
  // Enter on a tile still opens what it opens
  const { onKeyDown, ...pointer } = listeners ?? {};
  const node = useRef<HTMLDivElement>(null);
  // While its corner's dragged, the columns and rows nearest the pointer,
  // before they're saved
  const [resizing, setResizing] = useState<TileSize>();
  const shown = resizing ?? size;

  function startResize(e: ReactPointerEvent<HTMLButtonElement>) {
    const tile = node.current;
    const grid = tile?.parentElement;
    if (!tile || !grid) return;
    e.preventDefault();
    e.stopPropagation();
    const style = getComputedStyle(grid);
    const columns = style.gridTemplateColumns.split(' ').length;
    const gap = parseFloat(style.columnGap) || 0;
    const rowGap = parseFloat(style.rowGap) || 0;
    const columnWidth = (grid.clientWidth - gap * (columns - 1)) / columns;
    const start = tile.getBoundingClientRect();
    // Rows are as tall as what's in them: one row of this tile, as it is now
    const rowHeight = (start.height - rowGap * (size.height - 1)) / size.height;
    const from = { x: e.clientX, y: e.clientY };
    const widest = Math.min(columns, MAX_WIDTH);
    let next = size;

    /** The columns or rows nearest a length. */
    function span(length: number, unit: number, gapSize: number, most: number) {
      return Math.min(
        Math.max(Math.round((length + gapSize) / (unit + gapSize)), 1),
        most
      );
    }

    const move = (m: PointerEvent) => {
      next = {
        // On one column there's no width to change, so it keeps what it has
        width:
          columns > 1
            ? span(start.width + m.clientX - from.x, columnWidth, gap, widest)
            : size.width,
        height: span(
          start.height + m.clientY - from.y,
          rowHeight,
          rowGap,
          MAX_HEIGHT
        ),
      };
      setResizing(next);
    };
    const end = () => {
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (next.width !== size.width || next.height !== size.height) {
        onResize(next);
      }
      setResizing(undefined);
    };
    // The resize cursor stays wherever the pointer goes, until it's let go
    document.body.style.cursor = 'nwse-resize';
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  }

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        node.current = el;
      }}
      data-dragging={isDragging}
      className={cn(
        'relative grid cursor-grab rounded-lg data-[dragging=true]:opacity-40',
        spanClasses(shown.width, shown.height),
        resizing && 'z-10 ring-2 ring-primary'
      )}
      {...pointer}
    >
      <div inert={inertContent} className='grid'>
        {children(shown)}
      </div>
      <button
        type='button'
        ref={setActivatorNodeRef}
        aria-label={`Drag to move ${name}`}
        // A tab on its top edge, clear of whatever the tile shows
        className='absolute -top-2 left-1/2 -translate-x-1/2 cursor-grab touch-none rounded-full bg-card px-1.5 text-muted-foreground ring-1 ring-foreground/10 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring'
        {...attributes}
        onKeyDown={onKeyDown as KeyboardEventHandler}
      >
        <GripHorizontalIcon className='size-4' />
      </button>
      <button
        type='button'
        tabIndex={-1}
        aria-hidden
        title='Drag to resize'
        onPointerDown={startResize}
        // Not a press that drags the tile
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        // A knob on its corner, clear of whatever the tile shows
        className='absolute -right-2 -bottom-2 flex size-5 cursor-nwse-resize touch-none items-center justify-center rounded-full bg-card text-muted-foreground ring-1 ring-foreground/10 hover:text-foreground'
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
        <span className='pointer-events-none absolute right-6 bottom-1.5 rounded-md bg-primary px-1.5 font-mono text-xs/5 text-primary-foreground tabular-nums'>
          {resizing.width} × {resizing.height}
        </span>
      )}
    </div>
  );
}

/** Onto the tile under the pointer, or the nearest when there's none. */
export const nearestTile: CollisionDetection = (args) => {
  const hits = pointerWithin(args);
  return hits.length ? hits : closestCenter(args);
};

export type ArrangeItem = TileSize & { key: string; name: string };

/**
 * One grid of tiles to reorder and resize, as the server's stats are, each
 * drawn by `render`. Their content can't be used meanwhile.
 */
export function ArrangeGrid({
  items,
  onArrange,
  onResize,
  render,
}: {
  items: ArrangeItem[];
  /** Their keys in their new order */
  onArrange: (keys: string[]) => void;
  onResize: (key: string, size: TileSize) => void;
  render: (key: string, size: TileSize) => ReactNode;
}) {
  const sensors = useArrangeSensors();
  // While dragging, the order as it's being changed
  const [draft, setDraft] = useState<string[]>();
  const [active, setActive] = useState<string>();
  const keys = draft ?? items.map((i) => i.key);
  const byKey = new Map(items.map((i) => [i.key, i]));
  const dragged = active ? byKey.get(active) : undefined;

  function onDragOver({ active, over }: DragOverEvent) {
    if (!over || active.id === over.id) return;
    setDraft((order = keys) =>
      arrayMove(
        order,
        order.indexOf(String(active.id)),
        order.indexOf(String(over.id))
      )
    );
  }

  function finish(save: boolean) {
    if (save && draft) onArrange(draft);
    setActive(undefined);
    setDraft(undefined);
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={nearestTile}
      onDragStart={({ active }) => {
        setActive(String(active.id));
        setDraft(keys);
      }}
      onDragOver={onDragOver}
      onDragEnd={() => finish(true)}
      onDragCancel={() => finish(false)}
    >
      <SortableContext items={keys} strategy={inPlace}>
        <div className={cn(TILE_GRID, 'select-none')}>
          {keys.map((key) => {
            const item = byKey.get(key);
            return (
              item && (
                <ArrangeTile
                  key={key}
                  id={key}
                  name={item.name}
                  size={item}
                  inertContent
                  onResize={(size) => onResize(key, size)}
                >
                  {(size) => render(key, size)}
                </ArrangeTile>
              )
            );
          })}
        </div>
      </SortableContext>
      <DragOverlay>
        {dragged && (
          <div className='grid size-full cursor-grabbing rounded-lg shadow-lg'>
            {render(dragged.key, dragged)}
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
