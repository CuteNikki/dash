'use client';

import {
  closestCenter,
  DndContext,
  DragOverlay,
  pointerWithin,
  useDroppable,
  type CollisionDetection,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
  type UniqueIdentifier,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useState, type ReactNode } from 'react';

import { GripVerticalIcon } from 'lucide-react';

import type { ServiceGroup } from '@/lib/groups';
import type { Service } from '@/lib/types';
import { cn } from '@/lib/utils';

import {
  ArrangeTile,
  GridTile,
  inPlace,
  TILE_GRID,
  useArrangeSensors,
} from '@/components/arrange';
import { ServiceTile } from '@/components/service-tile';

/** Groups in order, each with its tiles' keys in order. */
export type Layout = { name: string; keys: string[] }[];

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
          <div className={TILE_GRID}>
            {group.services.map((service) => (
              <GridTile key={service.key} size={service}>
                <ServiceTile
                  service={service}
                  editing={false}
                  onOpen={onOpen}
                />
              </GridTile>
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
  const sensors = useArrangeSensors();
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
              <SortableContext items={group.keys} strategy={inPlace}>
                {group.keys.map((key) => {
                  const service = services.get(key);
                  return (
                    service && (
                      <ArrangeTile
                        key={key}
                        id={key}
                        name={service.name}
                        size={service}
                        onResize={(size) =>
                          onResize(service, size.width, size.height)
                        }
                      >
                        {(size) => (
                          <ServiceTile
                            service={{ ...service, ...size }}
                            editing
                            onOpen={onOpen}
                          />
                        )}
                      </ArrangeTile>
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
          <div className='grid size-full cursor-grabbing rounded-lg shadow-lg'>
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
          TILE_GRID,
          // Room to drop onto once a group's last tile has left it
          !count && 'min-h-20 rounded-lg border border-dashed'
        )}
      >
        {children}
      </div>
    </section>
  );
}
