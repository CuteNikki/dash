'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';

import { PencilIcon } from 'lucide-react';

import { arrangeGroups, saveLayout, type TileResult } from '@/actions/tiles';
import { fetcher } from '@/lib/fetcher';
import { groupNames, groupServices } from '@/lib/groups';
import type { Dashboard as DashboardData, Service } from '@/lib/types';

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
import { ServiceTile } from '@/components/service-tile';
import { ThemeButton } from '@/components/theme-button';
import { Button } from '@/components/ui/button';

/** How often the dashboard asks for fresh status and usage. */
const REFRESH_MS = 5_000;

export function Dashboard({
  initial,
  initialColumns,
  email,
}: {
  initial: DashboardData;
  /** The columns the screen had last time, so the first paint has them */
  initialColumns: number;
  email: string;
}) {
  const columns = useColumns(initialColumns);
  const { data = initial, mutate } = useSWR<DashboardData>(
    '/api/services',
    fetcher,
    { fallbackData: initial, refreshInterval: REFRESH_MS }
  );
  const [editing, setEditing] = useState(false);
  // By key, so these follow the live data and survive a recreated container
  const [openKey, setOpenKey] = useState<string>();
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
    const keys = new Set(cells.map((c) => c.key));
    const groupOf = new Map(moved.map((m) => [m.key, m.group]));
    void change(
      (d) => ({
        ...d,
        layouts: [
          ...d.layouts.filter(
            (l) => !(l.columns === columns && keys.has(l.key))
          ),
          ...cells.map((c) => ({ ...c, columns })),
        ],
        services: d.services.map((s) =>
          groupOf.has(s.key) ? { ...s, group: groupOf.get(s.key)! } : s
        ),
      }),
      () => saveLayout({ columns, cells, moved }),
      "Couldn't save where tiles go"
    );
  }

  function saveGroups(names: string[]) {
    void change(
      (d) => ({ ...d, groupOrder: names }),
      () => arrangeGroups(names),
      "Couldn't save the groups' order"
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
    ...groups.map((g) => ({
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
    else setOpenKey(service.key);
  }

  return (
    // As wide as the screen: wider screens get more columns of tiles
    <div className='flex w-full flex-col gap-8 px-4 py-6 sm:px-6'>
      <header className='flex items-center gap-3'>
        <h1 className='mr-auto text-base font-semibold tracking-tight'>dash</h1>
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
        onGroups={saveGroups}
      />
      <ServiceDialog
        service={find(openKey)}
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
