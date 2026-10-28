'use client';

import {
  closestCenter,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MeasuringStrategy,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type CollisionDetection,
  type DragMoveEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { useLayoutEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  ExternalLinkIcon,
  EyeOffIcon,
  GripVerticalIcon,
  LoaderIcon,
  PlayIcon,
  RotateCwIcon,
  ScrollTextIcon,
  SquareIcon,
} from 'lucide-react';

import { runContainerAction } from '@/actions/containers';
import type { OrderInput } from '@/actions/tiles';
import {
  groupsOf,
  HEADING,
  listRows,
  moveRow,
  type ServiceGroup,
} from '@/lib/dashboard/groups';
import { isRunning, labelOf } from '@/lib/dashboard/status';
import type { ListFilter } from '@/lib/dashboard/view';
import type { ContainerAction } from '@/lib/docker/docker';
import { formatBytes, formatCpu, formatMs, MEASURES } from '@/lib/format';
import type { Service } from '@/lib/types';
import { cn } from '@/lib/utils';

import { Sparkline } from '@/components/charts/sparkline';
import { WidgetStats, widgetStats } from '@/components/charts/widget-stats';
import { useCan } from '@/components/common/role';
import { attempt } from '@/components/common/toasts';
import { GroupName } from '@/components/dashboard/group-name';
import { addressWords } from '@/components/service/address-text';
import { ServiceIcon } from '@/components/service/service-icon';
import { StatePill, StatusDot } from '@/components/service/status-dot';
import { StopDialog } from '@/components/service/stop-dialog';
import { Button } from '@/components/ui/button';
import { UpdateBadge } from '@/components/updates/update-badge';

/** A group's rows together, dragged by its heading. */
const GROUP = 'group:';

/**
 * Rows land among rows and headings, groups among groups: the one under the
 * pointer, or the nearest when it's past them all.
 */
const amongItsKind: CollisionDetection = (args) => {
  const mine = {
    ...args,
    droppableContainers: args.droppableContainers.filter(
      (c) => c.data.current?.kind === args.active.data.current?.kind
    ),
  };
  const under = pointerWithin(mine);
  return under.length ? under : closestCenter(mine);
};

/**
 * What's being dragged, and the list as it would be if it were let go now:
 * its rows, headings among them, and its groups' order.
 */
type Drag = {
  id: string;
  kind: 'row' | 'group';
  rows: string[];
  groups: string[];
};

const DONE: Record<ContainerAction, string> = {
  start: 'Started',
  stop: 'Stopped',
  restart: 'Restarted',
};

/**
 * Every service as a row of one table, under its group's name: what it is,
 * how it is, what it uses, where its stack is, and buttons for its logs and
 * to restart, stop or start it. Beside it, the groups to show one of, and
 * the stopped ones; above it on a phone. A row opens what a tile does.
 *
 * While editing, rows are dragged by their handles, or moved from them with
 * Space and the arrow keys, into another place or group, and groups by their
 * headings, with their rows: one order, the same on every screen. Not while
 * it's showing the stopped ones, which leaves out the rest of their groups,
 * and groups only while it shows them all.
 */
export function ServiceList({
  groups,
  filter: picked,
  onFilterAction,
  editing,
  onOpenAction,
  onLogsAction,
  onChangedAction,
  onReorderAction,
  onRenameAction,
}: {
  groups: ServiceGroup[];
  filter: ListFilter;
  onFilterAction: (filter: ListFilter) => void;
  editing: boolean;
  onOpenAction: (service: Service) => void;
  onLogsAction: (service: Service) => void;
  /** After an action, so the dashboard refreshes right away; the row waits on it */
  onChangedAction: () => Promise<unknown>;
  /** The list's new order, once something's been dragged */
  onReorderAction: (order: OrderInput) => void;
  /** A group renamed while editing, with every service in it */
  onRenameAction: (from: string, keys: string[], name: string) => void;
}) {
  // A group since renamed or emptied shows them all
  const filter: ListFilter =
    picked.kind === 'group' && !groups.some((g) => g.name === picked.name)
      ? { kind: 'all' }
      : picked;
  const [stopping, setStopping] = useState<Service>();
  // What's being done to each, by key, until it's done
  const [busy, setBusy] = useState<Record<string, ContainerAction>>({});

  const all = groups.flatMap((g) => g.services);
  const stopped = all.filter((s) => !isRunning(s.state));
  const shown = groups
    .filter((g) => filter.kind !== 'group' || g.name === filter.name)
    .map((g) => ({
      ...g,
      services:
        filter.kind === 'stopped'
          ? g.services.filter((s) => !isRunning(s.state))
          : g.services,
    }))
    .filter((g) => g.services.length);

  function run(service: Service, action: ContainerAction) {
    setBusy((b) => ({ ...b, [service.key]: action }));
    void attempt(`Couldn't ${action} ${service.name}`, async () => {
      const result = await runContainerAction(service.containerId, action);
      if (result.ok) toast.success(`${DONE[action]} ${service.name}`);
      else
        toast.error(`Couldn't ${action} ${service.name}`, {
          description: result.error,
        });
      await onChangedAction();
    }).finally(() =>
      setBusy((b) => {
        const rest = { ...b };
        delete rest[service.key];
        return rest;
      })
    );
  }

  const reordering = editing && filter.kind !== 'stopped';
  const reorderingGroups = editing && filter.kind === 'all';
  const sensors = useSensors(
    // A little way first, so a press on a handle isn't taken for a drag
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const [drag, setDrag] = useState<Drag>();
  // A move made and not yet drawn, until which the next waits
  const settling = useRef(false);
  useLayoutEffect(() => {
    settling.current = false;
  }, [drag]);
  // While something's dragged, the list as it'll be once it's let go, so
  // where it's going shows as it goes
  const byKey = new Map(all.map((s) => [s.key, s]));
  const listed: ServiceGroup[] = !drag
    ? shown
    : drag.kind === 'row'
      ? [...groupsOf(drag.rows)].map(([name, keys]) => ({
          name,
          services: keys.map((k) => byKey.get(k)!),
        }))
      : drag.groups.map((name) => shown.find((g) => g.name === name)!);
  // Each group's heading, then its rows: what a row is dropped among
  const rows = listRows(listed);
  const dragged =
    drag?.kind === 'row'
      ? { row: byKey.get(drag.id) }
      : drag && {
          group: shown.find((g) => GROUP + g.name === drag.id),
        };

  /**
   * Saves groups in this order, each with its services in the order given,
   * or as they were if it isn't. A group left with none is gone.
   */
  function reorder(names: string[], byGroup: Map<string, string[]>) {
    const groupOf = new Map(all.map((s) => [s.key, s.group]));
    const order = names
      .map((name) => ({
        name,
        keys:
          byGroup.get(name) ??
          groups.find((g) => g.name === name)!.services.map((s) => s.key),
      }))
      .filter((g) => g.keys.length);
    onReorderAction({
      groups: order.map((g) => g.name),
      services: order.flatMap((g) =>
        g.keys.map((key) => ({
          key,
          group: groupOf.get(key) === g.name ? undefined : g.name,
        }))
      ),
    });
  }

  /**
   * Renames a group with all its services, not only those it shows, and
   * keeps showing it if it's the one picked.
   */
  function rename(from: string, name: string) {
    const keys = groups
      .find((g) => g.name === from)!
      .services.map((s) => s.key);
    onRenameAction(from, keys, name);
    if (filter.kind === 'group' && filter.name === from)
      onFilterAction({ kind: 'group', name });
  }

  // Where on what's dragged the pointer took hold, and how tall it is: where
  // its copy is, from the pointer, wherever its place in the list has gone
  const grip = useRef({ y: 0, height: 0 });

  function start({ active, activatorEvent }: DragStartEvent) {
    const box = active.rect.current.initial;
    if (box && activatorEvent instanceof PointerEvent) {
      grip.current = {
        y: activatorEvent.clientY - box.top,
        height: box.height,
      };
    }
    setDrag({
      id: String(active.id),
      kind: active.data.current?.kind,
      rows: listRows(shown),
      groups: shown.map((g) => g.name),
    });
  }

  /**
   * Over another row, heading or group, it takes that one's place once its
   * leading edge is past the other's middle: its foot going down, its top
   * going up. Going back takes moving back past the same point, so the two
   * don't swap back and forth, however tall either is. Where the other is
   * comes from the page as it is, and nothing moves again until a move is
   * drawn: positions measured before it would swap them straight back.
   */
  function move({ over, activatorEvent, delta }: DragMoveEvent) {
    if (!drag || settling.current) return;
    // The one under the pointer, or for the keyboard, the one it's moved to
    let target: Element | undefined;
    let id = over ? String(over.id) : undefined;
    if (activatorEvent instanceof PointerEvent) {
      target =
        document
          .elementsFromPoint(
            activatorEvent.clientX + delta.x,
            activatorEvent.clientY + delta.y
          )
          .map((e) => e.closest(`[data-sort-kind=${drag.kind}]`))
          .find((e) => e && e.getAttribute('data-sort') !== drag.id) ??
        undefined;
      id = target?.getAttribute('data-sort') ?? undefined;
    }
    if (!id || id === drag.id) return;
    const ids =
      drag.kind === 'row' ? drag.rows : drag.groups.map((g) => GROUP + g);
    const from = ids.indexOf(drag.id);
    const to = ids.indexOf(id);
    if (from < 0 || to < 0) return;
    // With the keyboard it moves a place at a time, so it's moved at once
    const rect = target?.getBoundingClientRect();
    if (rect && activatorEvent instanceof PointerEvent) {
      const top = activatorEvent.clientY + delta.y - grip.current.y;
      const theirs = rect.top + rect.height / 2;
      if (from < to ? top + grip.current.height < theirs : top > theirs) return;
    }
    settling.current = true;
    setDrag({
      ...drag,
      rows: drag.kind === 'row' ? moveRow(drag.rows, drag.id, id) : drag.rows,
      groups:
        drag.kind === 'group' ? arrayMove(drag.groups, from, to) : drag.groups,
    });
  }

  /** Let go: the list as it's shown is saved, if anything moved. */
  function drop() {
    if (!drag) return;
    setDrag(undefined);
    const names = shown.map((g) => g.name);
    if (drag.kind === 'group') {
      if (drag.groups.join() !== names.join()) {
        reorder(
          [
            ...drag.groups,
            ...groups.map((g) => g.name).filter((n) => !names.includes(n)),
          ],
          new Map()
        );
      }
    } else if (drag.rows.join() !== listRows(shown).join()) {
      reorder(
        groups.map((g) => g.name),
        groupsOf(drag.rows)
      );
    }
  }

  const same = (f: ListFilter) =>
    f.kind === filter.kind &&
    (f.kind !== 'group' || filter.kind !== 'group' || f.name === filter.name);

  return (
    <div className='flex flex-col gap-4 lg:flex-row lg:items-start'>
      <nav
        aria-label='Show'
        // A row of chips, swiped edge to edge without a scrollbar, until
        // there's room for a column beside the table
        className='-mx-4 flex scrollbar-none gap-1 overflow-x-auto px-4 sm:-mx-6 sm:px-6 lg:sticky lg:top-6 lg:mx-0 lg:w-44 lg:shrink-0 lg:flex-col lg:overflow-visible lg:px-0'
      >
        <FilterItem
          label='All'
          count={all.length}
          active={same({ kind: 'all' })}
          onPick={() => onFilterAction({ kind: 'all' })}
        />
        {groups.map((g) => (
          <FilterItem
            key={g.name}
            label={g.name}
            count={g.services.length}
            active={same({ kind: 'group', name: g.name })}
            onPick={() => onFilterAction({ kind: 'group', name: g.name })}
          />
        ))}
        <div className='mx-1 my-0 w-px shrink-0 bg-border lg:mx-0 lg:my-2 lg:h-px lg:w-auto' />
        <FilterItem
          label='Stopped'
          count={stopped.length}
          active={same({ kind: 'stopped' })}
          onPick={() => onFilterAction({ kind: 'stopped' })}
        />
      </nav>

      <div className='min-w-0 flex-1 overflow-hidden rounded-lg bg-card ring-1 ring-foreground/10'>
        {/* Fixed columns, sized by the headings, each hidden with its column where there's no room */}
        <DndContext
          sensors={sensors}
          collisionDetection={amongItsKind}
          // Measured as the list's rearranged under the pointer
          measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
          // Scrolling only right at the window's edge, not as soon as a row
          // near its top or foot is picked up
          autoScroll={{ threshold: { x: 0, y: 0.08 }, acceleration: 5 }}
          onDragStart={start}
          onDragMove={move}
          onDragEnd={drop}
          onDragCancel={() => setDrag(undefined)}
        >
          <SortableContext
            items={listed.map((g) => GROUP + g.name)}
            strategy={verticalListSortingStrategy}
          >
            <SortableContext
              items={rows}
              strategy={verticalListSortingStrategy}
            >
              <table className='w-full table-fixed text-xs'>
                <ColumnHeads />
                {listed.map((group) => (
                  <GroupBody
                    key={group.name}
                    name={group.name}
                    reordering={reorderingGroups}
                    onRename={
                      editing ? (name) => rename(group.name, name) : undefined
                    }
                  >
                    {group.services.map((service) => (
                      <Row
                        key={service.key}
                        service={service}
                        editing={editing}
                        reordering={reordering}
                        busy={busy[service.key]}
                        onOpen={onOpenAction}
                        onLogs={onLogsAction}
                        onRun={(action) =>
                          action === 'stop'
                            ? setStopping(service)
                            : run(service, action)
                        }
                      />
                    ))}
                  </GroupBody>
                ))}
              </table>
            </SortableContext>
          </SortableContext>
          {/* What's dragged, under the pointer, raised off the list */}
          <DragOverlay>
            {dragged && (dragged.row || dragged.group) && (
              // The same rows in the same columns, raised off the list
              <div className='pointer-events-none size-full cursor-grabbing overflow-hidden rounded-lg bg-card shadow-lg ring-1 ring-foreground/15'>
                <table className='w-full table-fixed text-xs'>
                  <ColumnHeads collapsed />
                  <tbody>
                    {dragged.group && (
                      <GroupHeading
                        name={dragged.group.name}
                        copy
                        handle={{}}
                      />
                    )}
                    {(dragged.row
                      ? [dragged.row]
                      : dragged.group!.services
                    ).map((service) => (
                      <Row
                        key={service.key}
                        service={service}
                        copy
                        editing={editing}
                        reordering={reordering}
                        onOpen={() => {}}
                        onLogs={() => {}}
                        onRun={() => {}}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DragOverlay>
        </DndContext>
        {!shown.length && (
          <p className='px-3 py-6 text-center text-muted-foreground'>
            Nothing&apos;s stopped.
          </p>
        )}
      </div>

      <StopDialog
        name={stopping?.name}
        open={!!stopping}
        onOpenChangeAction={(open) => !open && setStopping(undefined)}
        onStopAction={() => stopping && run(stopping, 'stop')}
      />
    </div>
  );
}

function FilterItem({
  label,
  count,
  active,
  onPick,
}: {
  label: string;
  count: number;
  active: boolean;
  onPick: () => void;
}) {
  return (
    <button
      type='button'
      aria-pressed={active}
      onClick={onPick}
      className={cn(
        'flex shrink-0 items-center gap-3 rounded-md px-2.5 py-1.5 text-left text-sm text-muted-foreground outline-none hover:bg-muted/50 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset lg:justify-between',
        // Picked: its color and outline, not its weight, so it's no wider;
        // the outline inside it, which the swiped row of chips would cut off
        active && 'bg-card text-foreground ring-1 ring-foreground/10 ring-inset'
      )}
    >
      <span className='truncate'>{label}</span>
      <span className='font-mono text-xs text-muted-foreground tabular-nums'>
        {count}
      </span>
    </button>
  );
}

/** Where a row or group is dragged by, or picked up from with Space. */
function DragHandle({
  label,
  attributes,
  listeners,
}: Pick<ReturnType<typeof useSortable>, 'attributes' | 'listeners'> & {
  label: string;
}) {
  return (
    <button
      type='button'
      aria-label={label}
      title='Drag to move'
      className='shrink-0 cursor-grab touch-none rounded-sm p-0.5 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing'
      {...attributes}
      {...listeners}
      // Not a click on the row it's in
      onClick={(e) => e.stopPropagation()}
    >
      <GripVerticalIcon className='size-4' />
    </button>
  );
}

/**
 * The columns' headings, which give them their widths: hidden for a copy of
 * some rows, so its columns are as wide as theirs with no heading above.
 */
function ColumnHeads({ collapsed }: { collapsed?: boolean }) {
  return (
    <thead
      aria-hidden={collapsed}
      className={cn(
        'text-left font-medium tracking-wide text-muted-foreground uppercase',
        collapsed && 'invisible [&_th]:py-0 [&_th]:leading-0'
      )}
    >
      <tr className={cn(!collapsed && 'border-b')}>
        <th className='px-3 py-2.5 font-medium'>Service</th>
        <th className='hidden w-28 px-2 py-2.5 font-medium sm:table-cell'>
          Status
        </th>
        <th className='w-14 px-2 py-2.5 font-medium sm:w-16 lg:w-36'>CPU</th>
        <th className='w-18 px-2 py-2.5 font-medium sm:w-20'>Memory</th>
        <th className='hidden w-[22%] px-2 py-2.5 font-medium xl:table-cell'>
          Stack
        </th>
        <th className='hidden w-28 px-3 py-2.5 text-right font-medium sm:table-cell'>
          Actions
        </th>
      </tr>
    </thead>
  );
}

/**
 * A group's rows, moved together while it's dragged by its heading, and
 * faded where they'll go meanwhile.
 */
function GroupBody({
  name,
  reordering,
  onRename,
  children,
}: {
  name: string;
  reordering: boolean;
  onRename?: (name: string) => void;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: GROUP + name,
    data: { kind: 'group' },
    disabled: !reordering,
  });
  return (
    <tbody
      ref={setNodeRef}
      data-sort={GROUP + name}
      data-sort-kind='group'
      data-dragging={isDragging}
      className='data-[dragging=true]:bg-primary/10 data-[dragging=true]:*:*:opacity-30'
    >
      <GroupHeading
        name={name}
        handle={reordering ? { attributes, listeners } : undefined}
        onRename={onRename}
      />
      {children}
    </tbody>
  );
}

/**
 * A group's name over its rows, the whole bar what the group is dragged by
 * while editing, but for its name, which is then a field to rename it by. Rows are dropped on it too: from below, to go last in the
 * group above; from above, first in its own.
 */
function GroupHeading({
  name,
  handle,
  copy,
  onRename,
}: {
  name: string;
  handle?: Partial<
    Pick<ReturnType<typeof useSortable>, 'attributes' | 'listeners'>
  >;
  /** Drawn under the pointer as it's dragged, not a place to drop on */
  copy?: boolean;
  /** Its name a field to rename it by, while editing */
  onRename?: (name: string) => void;
}) {
  const { setNodeRef } = useSortable({
    id: (copy ? 'copy:' : HEADING) + name,
    data: { kind: 'row' },
    disabled: copy || { draggable: true },
  });
  return (
    <tr
      ref={setNodeRef}
      data-sort={copy ? undefined : HEADING + name}
      data-sort-kind={copy ? undefined : 'row'}
      {...handle?.attributes}
      {...handle?.listeners}
      aria-label={
        handle
          ? `Move ${name}: Space to pick it up, then the arrow keys`
          : undefined
      }
      className={cn(
        'border-b bg-muted/30 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset',
        handle &&
          'cursor-grab touch-none hover:bg-muted/60 active:cursor-grabbing'
      )}
    >
      {/* A cell for each column, hidden with it, rather than one
          spanning them all, which would keep the hidden ones' room */}
      <th
        scope='colgroup'
        className='truncate px-3 py-1.5 text-left font-medium tracking-wide text-muted-foreground uppercase'
      >
        <span className='flex items-center gap-3'>
          {/* Where the rows' handles are, so the bar reads as one */}
          {/* Taller than the line, so held out of it, or the bar would
              grow and the list below move down as editing starts */}
          {handle && (
            <span className='-my-0.5 shrink-0 p-0.5'>
              <GripVerticalIcon className='size-4' />
            </span>
          )}
          {onRename ? (
            // Typing and pressing in it is renaming, not taking hold of the bar
            <span
              className='flex min-w-0'
              onPointerDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <GroupName
                name={name}
                onRename={onRename}
                className='max-w-full'
              />
            </span>
          ) : (
            <span className='truncate'>{name}</span>
          )}
        </span>
      </th>
      <td className='hidden sm:table-cell' />
      <td />
      <td />
      <td className='hidden xl:table-cell' />
      <td className='hidden sm:table-cell' />
    </tr>
  );
}

/** "/home/nikki/services/ludo" as "~/services/ludo". */
function shortPath(dir: string) {
  return dir.replace(/^\/home\/[^/]+/, '~');
}

function Row({
  service,
  copy,
  editing,
  reordering,
  busy,
  onOpen,
  onLogs,
  onRun,
}: {
  service: Service;
  /** Drawn under the pointer as it's dragged, not a place to drop on */
  copy?: boolean;
  editing: boolean;
  /** Dragged by a handle at its start */
  reordering: boolean;
  /** What's being done to it, which its buttons wait on */
  busy?: ContainerAction;
  onOpen: (service: Service) => void;
  onLogs: (service: Service) => void;
  onRun: (action: ContainerAction) => void;
}) {
  const running = isRunning(service.state);
  // Starting and stopping is for those whose role may
  const controls = useCan()('control');
  const usage = running ? service.usage : undefined;
  // A website's response time, in place of a container's CPU
  const check = service.site?.check;
  const stats = widgetStats(service);
  const address = service.addresses[0];
  // Under its name: what it is, or where to reach it, or its container
  const detail =
    service.description ??
    (address ? addressWords(address) : service.containerName);
  const { attributes, listeners, setNodeRef, isDragging } = useSortable({
    id: (copy ? 'copy:' : '') + service.key,
    data: { kind: 'row' },
    disabled: copy || !reordering,
  });

  return (
    <tr
      ref={setNodeRef}
      data-sort={copy ? undefined : service.key}
      data-sort-kind={copy ? undefined : 'row'}
      // Where it'll go, faded, while its copy follows the pointer
      data-dragging={isDragging}
      tabIndex={0}
      aria-label={editing ? `Edit ${service.name}` : service.name}
      data-hidden={service.hidden}
      onClick={() => onOpen(service)}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(service);
        }
      }}
      className='cursor-pointer border-b outline-none last:border-0 hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset data-[dragging=true]:bg-primary/10 data-[dragging=true]:*:opacity-30 data-[hidden=true]:*:opacity-60'
    >
      <td className='px-3 py-2.5'>
        <div className='flex items-center gap-3'>
          {reordering && (
            <DragHandle
              label={`Move ${service.name}: Space to pick it up, then the arrow keys`}
              attributes={attributes}
              listeners={listeners}
            />
          )}
          {/* None on the narrowest phones, to give its name and numbers
              the room; its state and update go before its name there */}
          <span className='relative flex shrink-0 max-xs:hidden'>
            <ServiceIcon
              icon={service.icon}
              variants={service.iconVariants}
              missing={service.iconMissing}
              name={service.name}
            />
            {/* Its state on its icon's corner, where there's no column for
                it, ringed in the table's color to stand off the icon */}
            <StatusDot
              state={service.state}
              className='absolute -right-0.5 -bottom-0.5 size-2.5 ring-2 ring-card sm:hidden'
            />
            {/* An update waiting on its other corner, so the name keeps its room */}
            {service.update && (
              <UpdateBadge
                update={service.update}
                corner
                className='absolute -top-1 -right-1'
              />
            )}
          </span>
          <div className='min-w-0 flex-1'>
            <div className='flex items-center gap-2'>
              <StatusDot
                state={service.state}
                className='hidden size-2 shrink-0 max-xs:block'
              />
              {service.update && (
                <UpdateBadge
                  update={service.update}
                  className='hidden max-xs:block'
                />
              )}
              <span className='truncate text-sm font-medium'>
                {service.name}
              </span>
              {service.hidden && (
                <EyeOffIcon
                  aria-label='Hidden'
                  className='size-3.5 shrink-0 text-muted-foreground'
                />
              )}
            </div>
            <div className='truncate text-muted-foreground' title={detail}>
              {detail}
            </div>
            {stats && <WidgetStats stats={stats} className='mt-1.5' />}
          </div>
        </div>
      </td>
      <td className='hidden px-2 py-2.5 sm:table-cell'>
        <StatePill state={service.state} label={labelOf(service)} />
      </td>
      <td className='px-2 py-2.5 font-mono tabular-nums'>
        {check ? (
          <span className='flex items-center gap-3'>
            <span className='w-10 shrink-0'>{formatMs(check.ms)}</span>
            <Sparkline
              values={check.history.ms}
              measure={MEASURES.response}
              className='hidden min-w-0 flex-1 lg:block'
            />
          </span>
        ) : usage ? (
          <span className='flex items-center gap-3'>
            <span className='w-10 shrink-0'>{formatCpu(usage.cpu)}</span>
            <Sparkline
              values={usage.history.cpu}
              measure={MEASURES.cpu}
              className='hidden min-w-0 flex-1 lg:block'
            />
          </span>
        ) : (
          <span className='text-muted-foreground'>–</span>
        )}
      </td>
      <td
        className={cn(
          'px-2 py-2.5 font-mono tabular-nums',
          !usage && 'text-muted-foreground'
        )}
      >
        {usage ? formatBytes(usage.memory) : '–'}
      </td>
      <td className='hidden truncate px-2 py-2.5 font-mono text-muted-foreground xl:table-cell'>
        {service.stack && shortPath(service.stack.dir)}
      </td>
      <td className='hidden px-3 py-2.5 sm:table-cell'>
        {/* Its own buttons, not a click on the row */}
        <div
          className='flex justify-end gap-0.5'
          onClick={(e) => e.stopPropagation()}
        >
          {service.site ? (
            // Nothing to start or stop: only somewhere to go
            service.url && (
              <Button
                variant='outline'
                size='icon-sm'
                aria-label='Open'
                title='Open'
                className='text-muted-foreground hover:text-foreground'
                asChild
              >
                <a href={service.url} target='_blank' rel='noreferrer'>
                  <ExternalLinkIcon />
                </a>
              </Button>
            )
          ) : (
            <>
              <ActionButton label='Logs' onClick={() => onLogs(service)}>
                <ScrollTextIcon />
              </ActionButton>
              {controls && (
                // Kept in its place while stopped, as the window's is, so
                // the rows' buttons line up
                <ActionButton
                  label='Restart'
                  variant='warning'
                  disabled={!!busy || !running}
                  onClick={() => onRun('restart')}
                >
                  <RotateCwIcon
                    className={cn(busy === 'restart' && 'animate-spin')}
                  />
                </ActionButton>
              )}
              {!controls ? null : running ? (
                <ActionButton
                  label='Stop'
                  variant='destructive'
                  disabled={!!busy}
                  onClick={() => onRun('stop')}
                >
                  {busy === 'stop' ? (
                    <LoaderIcon className='animate-spin' />
                  ) : (
                    <SquareIcon />
                  )}
                </ActionButton>
              ) : (
                <ActionButton
                  label='Start'
                  variant='success'
                  disabled={!!busy}
                  onClick={() => onRun('start')}
                >
                  {busy === 'start' ? (
                    <LoaderIcon className='animate-spin' />
                  ) : (
                    <PlayIcon />
                  )}
                </ActionButton>
              )}
            </>
          )}
        </div>
      </td>
    </tr>
  );
}

/** In the service window's colours: red to stop, amber to restart, green to start. */
function ActionButton({
  label,
  variant = 'outline',
  disabled,
  onClick,
  children,
}: {
  label: string;
  variant?: 'outline' | 'destructive' | 'warning' | 'success';
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant={variant}
      size='icon-sm'
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        variant === 'outline' && 'text-muted-foreground hover:text-foreground'
      )}
    >
      {children}
    </Button>
  );
}
