'use client';

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
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
  useRef,
  useState,
  type KeyboardEventHandler,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from 'react';

import { GripVerticalIcon } from 'lucide-react';

import type { ServiceGroup } from '@/lib/groups';
import { MAX_HEIGHT, MAX_WIDTH, spanClasses } from '@/lib/tile-size';
import type { Service } from '@/lib/types';
import { cn } from '@/lib/utils';

import { ServiceTile } from '@/components/service-tile';

/** Groups in order, each with its tiles' keys in order. */
export type Layout = { name: string; keys: string[] }[];

const GRID =
  // Each row at least a tile's height, so a taller tile is that many tall
  'grid auto-rows-[minmax(6rem,auto)] grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4';

export function TilesView({
  groups,
  editing,
  onOpen,
  onArrange,
  onResize,
}: {
  groups: ServiceGroup[];
  /** While editing, tiles and groups are dragged to move them and tiles resized */
  editing: boolean;
  onOpen: (service: Service) => void;
  onArrange: (layout: Layout) => void;
  onResize: (service: Service, width: number, height: number) => void;
}) {
  if (editing) {
    return (
      <ArrangeView
        groups={groups}
        onOpen={onOpen}
        onArrange={onArrange}
        onResize={onResize}
      />
    );
  }
  return (
    <div className='flex flex-col gap-8'>
      {groups.map((group) => (
        <section key={group.name} className='flex flex-col gap-3'>
          <GroupHeading name={group.name} count={group.services.length} />
          <div className={GRID}>
            {group.services.map((service) => (
              <div
                key={service.key}
                className={spanClasses(service.width, service.height)}
              >
                <ServiceTile
                  service={service}
                  editing={false}
                  onOpen={onOpen}
                />
              </div>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

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
    <h2 className='flex items-center gap-2 text-xs font-medium tracking-wide text-muted-foreground uppercase'>
      {handle}
      {name}
      <span className='font-mono tracking-normal tabular-nums'>{count}</span>
    </h2>
  );
}

function layoutOf(groups: ServiceGroup[]): Layout {
  return groups.map((g) => ({
    name: g.name,
    keys: g.services.map((s) => s.key),
  }));
}

/** The smallest the outline following a resize gets, as a share of a column or row. */
const MIN_SHRINK = 0.5;

type Resizing = {
  /** The outline following the pointer, in pixels */
  w: number;
  h: number;
  /** Columns and rows the tile takes meanwhile */
  width: number;
  height: number;
};

const GROUP_ID = 'group:';
const GRID_ID = 'grid:';

type DragData =
  | { type: 'group' }
  | { type: 'tile' }
  /** The space a group's tiles sit in, for dropping onto past its last one */
  | { type: 'grid'; group: string };

/**
 * A group being dragged lands among the groups; a tile, on another tile or
 * on a group's grid, preferring the tile under the pointer.
 */
const collisions: CollisionDetection = (args) => {
  const type = (args.active.data.current as DragData | undefined)?.type;
  const typeOf = (id: UniqueIdentifier) =>
    (
      args.droppableContainers.find((c) => c.id === id)?.data.current as
        DragData | undefined
    )?.type;
  const droppableContainers = args.droppableContainers.filter((c) =>
    type === 'group'
      ? c.data.current?.type === 'group'
      : c.data.current?.type !== 'group'
  );
  const narrowed = { ...args, droppableContainers };
  if (type === 'group') return closestCenter(narrowed);
  const hits = pointerWithin(narrowed);
  const tile = hits.find((h) => typeOf(h.id) === 'tile');
  if (tile) return [tile];
  return hits.length ? hits : closestCenter(narrowed);
};

/**
 * Tiles move as they're dragged, so the grid shows where one will land
 * whatever its size; groups are dragged by the handle on their headings.
 * Either can be moved by the keyboard too: Space on a handle, the arrow
 * keys, then Space again.
 */
function ArrangeView({
  groups,
  onOpen,
  onArrange,
  onResize,
}: {
  groups: ServiceGroup[];
  onOpen: (service: Service) => void;
  onArrange: (layout: Layout) => void;
  onResize: (service: Service, width: number, height: number) => void;
}) {
  const sensors = useSensors(
    // A click still opens a tile's editor; a press on a phone still scrolls
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 8 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );
  // While dragging, the layout as it's being changed
  const [draft, setDraft] = useState<Layout>();
  const [active, setActive] = useState<UniqueIdentifier>();
  const layout = draft ?? layoutOf(groups);
  const services = new Map(
    groups.flatMap((g) => g.services).map((s) => [s.key, s])
  );

  const groupOf = (l: Layout, key: string) =>
    l.findIndex((g) => g.keys.includes(key));

  function onDragStart({ active }: DragStartEvent) {
    setActive(active.id);
    setDraft(layoutOf(groups));
  }

  function onDragOver({ active, over }: DragOverEvent) {
    const data = over?.data.current as DragData | undefined;
    if (!over || !data || active.id === over.id) return;
    if (active.data.current?.type !== 'tile') return;
    const key = String(active.id);
    setDraft((l = layoutOf(groups)) => {
      const from = groupOf(l, key);
      const to =
        data.type === 'grid'
          ? l.findIndex((g) => g.name === data.group)
          : groupOf(l, String(over.id));
      if (from < 0 || to < 0) return l;
      // Onto a grid but past its tiles: last in that group, if not there yet
      if (data.type === 'grid') {
        if (from === to) return l;
        return l.map((g, i) =>
          i === from
            ? { ...g, keys: g.keys.filter((k) => k !== key) }
            : i === to
              ? { ...g, keys: [...g.keys, key] }
              : g
        );
      }
      const at = l[to].keys.indexOf(String(over.id));
      if (from === to) {
        return l.map((g, i) =>
          i === to
            ? { ...g, keys: arrayMove(g.keys, g.keys.indexOf(key), at) }
            : g
        );
      }
      return l.map((g, i) =>
        i === from
          ? { ...g, keys: g.keys.filter((k) => k !== key) }
          : i === to
            ? { ...g, keys: g.keys.toSpliced(at, 0, key) }
            : g
      );
    });
  }

  function onDragEnd({ active, over }: DragEndEvent) {
    let next = draft ?? layoutOf(groups);
    if (active.data.current?.type === 'group' && over) {
      const names = next.map((g) => GROUP_ID + g.name);
      next = arrayMove(
        next,
        names.indexOf(String(active.id)),
        names.indexOf(String(over.id))
      );
    }
    setActive(undefined);
    setDraft(undefined);
    // A group a tile left empty is gone once it's saved
    onArrange(next.filter((g) => g.keys.length));
  }

  function onDragCancel() {
    setActive(undefined);
    setDraft(undefined);
  }

  // What's dragged, drawn whole under the pointer
  const id = active === undefined ? undefined : String(active);
  const draggedGroup = id?.startsWith(GROUP_ID)
    ? id.slice(GROUP_ID.length)
    : undefined;
  const draggedTile = id && !draggedGroup ? services.get(id) : undefined;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={collisions}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={onDragCancel}
    >
      <SortableContext
        items={layout.map((g) => GROUP_ID + g.name)}
        strategy={verticalListSortingStrategy}
      >
        <div className='flex flex-col gap-8 select-none'>
          {layout.map((group) => (
            <SortableGroup
              key={group.name}
              name={group.name}
              count={group.keys.length}
            >
              {/* No transforms: the grid itself moves tiles out of the way */}
              <SortableContext items={group.keys} strategy={() => null}>
                {group.keys.map((key) => {
                  const service = services.get(key);
                  return (
                    service && (
                      <SortableTile
                        key={key}
                        service={service}
                        onOpen={onOpen}
                        onResize={onResize}
                      />
                    )
                  );
                })}
              </SortableContext>
            </SortableGroup>
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {draggedGroup !== undefined ? (
          <div className='w-fit rounded-md bg-background px-2 py-1 shadow-md ring-1 ring-foreground/10'>
            <GroupHeading
              name={draggedGroup}
              count={
                layout.find((g) => g.name === draggedGroup)?.keys.length ?? 0
              }
              handle={<GripVerticalIcon className='size-4' />}
            />
          </div>
        ) : draggedTile ? (
          <div className='size-full cursor-grabbing rounded-lg shadow-lg'>
            <ServiceTile service={draggedTile} editing onOpen={() => {}} />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}

function SortableGroup({
  name,
  count,
  children,
}: {
  name: string;
  count: number;
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
  } = useSortable({ id: GROUP_ID + name, data: { type: 'group' } });
  const { setNodeRef: setGridRef } = useDroppable({
    id: GRID_ID + name,
    data: { type: 'grid', group: name },
  });
  return (
    <section
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      data-dragging={isDragging}
      className='flex flex-col gap-3 data-[dragging=true]:opacity-40'
    >
      <GroupHeading
        name={name}
        count={count}
        handle={
          <button
            type='button'
            ref={setActivatorNodeRef}
            aria-label={`Drag to move ${name}`}
            className='-ml-1 cursor-grab touch-none rounded-sm p-0.5 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing'
            {...attributes}
            {...listeners}
          >
            <GripVerticalIcon className='size-4' />
          </button>
        }
      />
      <div
        ref={setGridRef}
        className={cn(
          GRID,
          // Room to drop onto once a group's last tile has left it
          !count && 'min-h-20 rounded-lg border border-dashed'
        )}
      >
        {children}
      </div>
    </section>
  );
}

function SortableTile({
  service,
  onOpen,
  onResize,
}: {
  service: Service;
  onOpen: (service: Service) => void;
  onResize: (service: Service, width: number, height: number) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } =
    useSortable({ id: service.key, data: { type: 'tile' } });
  // Pressing anywhere drags it; the keyboard, only from its handle, so
  // Enter on the tile still opens its editor
  const { onKeyDown, ...pointer } = listeners ?? {};
  const node = useRef<HTMLDivElement>(null);
  // While its corner's dragged: the columns and rows it takes, nearest the
  // pointer, and the outline following the pointer, before it's saved
  const [resizing, setResizing] = useState<Resizing>();
  const shown = resizing
    ? { ...service, width: resizing.width, height: resizing.height }
    : service;

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
    const rowHeight =
      (start.height - rowGap * (service.height - 1)) / service.height;
    const from = { x: e.clientX, y: e.clientY };
    const widest = Math.min(columns, MAX_WIDTH);
    let next: Resizing = {
      w: start.width,
      h: start.height,
      width: service.width,
      height: service.height,
    };

    /** The columns or rows nearest a length, and the length the outline's drawn. */
    function axis(free: number, unit: number, gapSize: number, most: number) {
      const span = Math.min(
        Math.max(Math.round((free + gapSize) / (unit + gapSize)), 1),
        most
      );
      const largest = most * unit + (most - 1) * gapSize;
      return {
        span,
        drawn: Math.min(Math.max(free, unit * MIN_SHRINK), largest),
      };
    }

    const move = (m: PointerEvent) => {
      const y = axis(
        start.height + m.clientY - from.y,
        rowHeight,
        rowGap,
        MAX_HEIGHT
      );
      // On one column there's no width to change, so it keeps what it has
      const x =
        columns > 1
          ? axis(start.width + m.clientX - from.x, columnWidth, gap, widest)
          : { span: service.width, drawn: start.width };
      next = { w: x.drawn, h: y.drawn, width: x.span, height: y.span };
      setResizing(next);
    };
    const end = () => {
      document.body.style.cursor = '';
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
      if (next.width !== service.width || next.height !== service.height) {
        onResize(service, next.width, next.height);
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
        'relative cursor-grab data-[dragging=true]:opacity-40',
        spanClasses(shown.width, shown.height),
        resizing && 'z-10'
      )}
      {...pointer}
    >
      <ServiceTile service={shown} editing onOpen={onOpen} />
      <button
        type='button'
        ref={setActivatorNodeRef}
        aria-label={`Drag to move ${service.name}`}
        className='absolute top-2.5 right-2.5 cursor-grab touch-none rounded-sm p-0.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring'
        {...attributes}
        onKeyDown={onKeyDown as KeyboardEventHandler}
      >
        <GripVerticalIcon className='size-4' />
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
        className='absolute right-0.5 bottom-0.5 flex size-5 cursor-nwse-resize touch-none items-end justify-end p-1 text-muted-foreground hover:text-foreground'
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
      {/* Where the pointer's dragged the corner to; the tile itself takes
          whole columns and rows, and the tiles around it make room */}
      {resizing && (
        <div
          className='pointer-events-none absolute top-0 left-0 rounded-lg border-2 border-dashed border-primary/60'
          style={{ width: resizing.w, height: resizing.h }}
        />
      )}
    </div>
  );
}
