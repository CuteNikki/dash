'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';

import { LayoutGridIcon, ListIcon, PencilIcon } from 'lucide-react';

import { renameGroup, saveLayout, type TileResult } from '@/actions/tiles';
import { fetcher } from '@/lib/fetcher';
import { groupNames, groupServices } from '@/lib/groups';
import type { Dashboard as DashboardData, Service } from '@/lib/types';
import {
  FILTER_COOKIE,
  filterToCookie,
  VIEW_COOKIE,
  type ListFilter,
  type View,
} from '@/lib/view';

import { AccountMenu } from '@/components/account-menu';
import {
  Board,
  useColumns,
  type BoardSection,
  type LayoutChange,
} from '@/components/board';
import { EditTileDialog } from '@/components/edit-tile-dialog';
import { HostTileContent } from '@/components/host-stats';
import { ServiceDialog } from '@/components/service-dialog';
import { ServiceList } from '@/components/service-list';
import { ServiceTile } from '@/components/service-tile';
import { ThemeButton } from '@/components/theme-button';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

/** How often the dashboard asks for fresh status and usage. */
const REFRESH_MS = 5_000;

export function Dashboard({
  initial,
  initialColumns,
  initialView,
  initialFilter,
  email,
}: {
  initial: DashboardData;
  /** The columns the screen had last time, so the first paint has them */
  initialColumns: number;
  /** Tiles or the list, as picked last time */
  initialView: View;
  /** The list's filter, as picked last time */
  initialFilter: ListFilter;
  email: string;
}) {
  const columns = useColumns(initialColumns);
  const [view, setView] = useState(initialView);

  function pickView(next: View) {
    setView(next);
    document.cookie = `${VIEW_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
  }
  const [filter, setFilter] = useState(initialFilter);

  function pickFilter(next: ListFilter) {
    setFilter(next);
    document.cookie = `${FILTER_COOKIE}=${filterToCookie(next)}; path=/; max-age=31536000; samesite=lax`;
  }
  const { data = initial, mutate } = useSWR<DashboardData>(
    '/api/services',
    fetcher,
    { fallbackData: initial, refreshInterval: REFRESH_MS }
  );
  const [editing, setEditing] = useState(false);
  // By key, so these follow the live data and survive a recreated container
  const [openKey, setOpenKey] = useState<string>();
  const [openTab, setOpenTab] = useState<'usage' | 'logs'>('usage');
  const [editKey, setEditKey] = useState<string>();

  const { services, groupOrder, host, hostComing } = data;
  const shown = editing ? services : services.filter((s) => !s.hidden);
  const groups = useMemo(
    () => groupServices(shown, groupOrder),
    [shown, groupOrder]
  );
  const allGroups = useMemo(
    () => groupNames(services, groupOrder),
    [services, groupOrder]
  );
  const find = (key?: string) => services.find((s) => s.key === key);

  /** Shows a change at once, saves it, then shows what was saved. */
  async function change(
    update: (data: DashboardData) => DashboardData,
    save: () => Promise<TileResult>,
    failed: string
  ) {
    void mutate(update(data), { revalidate: false });
    const result = await save().catch(() => ({
      error: 'Something went wrong',
    }));
    if (result?.error) toast.error(failed, { description: result.error });
    void mutate();
  }

  function saveCells({ cells, moved }: LayoutChange) {
    const at = (key: string, columns: number) => `${key} ${columns}`;
    const replaced = new Set(cells.map((c) => at(c.key, c.columns)));
    const groupOf = new Map(moved.map((m) => [m.key, m.group]));
    void change(
      (d) => ({
        ...d,
        layouts: [
          ...d.layouts.filter((l) => !replaced.has(at(l.key, l.columns))),
          ...cells,
        ],
        services: d.services.map((s) =>
          groupOf.has(s.key) ? { ...s, group: groupOf.get(s.key)! } : s
        ),
      }),
      () => saveLayout({ cells, moved }),
      "Couldn't save where tiles go"
    );
  }

  function rename(section: BoardSection, name: string) {
    const from = section.label;
    const keys = section.tiles.map((t) => t.key);
    const sectionKey = (group: string) => `section:group:${group}`;
    void change(
      (d) => ({
        ...d,
        services: d.services.map((s) =>
          keys.includes(s.key) ? { ...s, group: name } : s
        ),
        groupOrder: d.groupOrder.map((g) => (g === from ? name : g)),
        layouts: d.layouts.map((l) =>
          l.key === sectionKey(from) ? { ...l, key: sectionKey(name) } : l
        ),
      }),
      () => renameGroup(from, name, keys),
      `Couldn't rename ${from}`
    );
  }

  const sections: BoardSection[] = [
    ...(host || hostComing
      ? [
          {
            id: 'host',
            kind: 'host' as const,
            label: 'Server',
            tiles: data.hostTiles.map((t) => ({
              key: `host:${t.key}`,
              name: t.name,
              w: t.width,
              h: t.height,
              inert: true,
              render: () => (
                <HostTileContent
                  tile={t.key}
                  host={host}
                  services={services}
                  onOpen={open}
                />
              ),
            })),
          },
        ]
      : []),
    // As a list, the groups aren't on the board
    ...(view === 'list' ? [] : groups).map((g) => ({
      id: `group:${g.name}`,
      kind: 'group' as const,
      label: g.name,
      tiles: g.services.map((service) => ({
        key: service.key,
        name: service.name,
        w: service.width,
        h: service.height,
        render: (cell: { w: number; h: number }) => (
          <ServiceTile
            service={{ ...service, width: cell.w, height: cell.h }}
            editing={editing}
            onOpen={open}
          />
        ),
      })),
    })),
  ];

  function open(service: Service) {
    if (editing) setEditKey(service.key);
    else {
      setOpenTab('usage');
      setOpenKey(service.key);
    }
  }

  return (
    // Wider screens get more columns of tiles, up to a width past which the
    // page would only spread out: then it's centered
    <div className='mx-auto flex w-full max-w-[2200px] flex-col gap-8 px-4 py-6 sm:px-6'>
      <header className='flex items-center gap-3'>
        <h1 className='mr-auto text-base font-semibold tracking-tight'>dash</h1>
        <ToggleGroup
          type='single'
          variant='outline'
          value={view}
          // Picking the shown one again would unpick it; keep one picked
          onValueChange={(v) => v && pickView(v as View)}
          aria-label='Show services as'
        >
          <ToggleGroupItem value='tiles' aria-label='Tiles'>
            <LayoutGridIcon />
          </ToggleGroupItem>
          <ToggleGroupItem value='list' aria-label='List'>
            <ListIcon />
          </ToggleGroupItem>
        </ToggleGroup>
        <Button
          variant={editing ? 'default' : 'outline'}
          aria-pressed={editing}
          onClick={() => setEditing(!editing)}
        >
          <PencilIcon />
          {editing ? 'Done' : 'Edit'}
        </Button>
        <ThemeButton />
        <AccountMenu email={email} />
      </header>
      <Board
        sections={sections}
        columns={columns}
        editing={editing}
        saved={data.layouts}
        onLayout={saveCells}
        onRename={rename}
      />
      {view === 'list' && (
        <ServiceList
          groups={groups}
          filter={filter}
          onFilter={pickFilter}
          editing={editing}
          onOpen={open}
          onLogs={(service) => {
            setOpenTab('logs');
            setOpenKey(service.key);
          }}
          onChanged={() => void mutate()}
        />
      )}
      <ServiceDialog
        service={find(openKey)}
        tab={openTab}
        memoryTotal={host?.memory.total}
        onClose={() => setOpenKey(undefined)}
        onChanged={() => void mutate()}
        onEdit={(service) => {
          setOpenKey(undefined);
          setEditKey(service.key);
        }}
      />
      <EditTileDialog
        service={find(editKey)}
        groups={allGroups}
        onClose={() => setEditKey(undefined)}
        onSaved={() => void mutate()}
      />
    </div>
  );
}
