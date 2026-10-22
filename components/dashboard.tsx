'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';

import { PencilIcon } from 'lucide-react';

import {
  arrangeHostTilesTo,
  arrangeTiles,
  resizeHostTile,
  resizeTile,
  type TileResult,
} from '@/actions/tiles';
import { fetcher } from '@/lib/fetcher';
import { groupNames, groupServices } from '@/lib/groups';
import type { Dashboard as DashboardData, Service } from '@/lib/types';

import { AccountMenu } from '@/components/account-menu';
import type { TileSize } from '@/components/arrange';
import { EditTileDialog } from '@/components/edit-tile-dialog';
import { HostStatsBar } from '@/components/host-stats';
import { ServiceDialog } from '@/components/service-dialog';
import { ThemeButton } from '@/components/theme-button';
import { TilesView, type Layout } from '@/components/tiles-view';
import { Button } from '@/components/ui/button';

/** How often the dashboard asks for fresh status and usage. */
const REFRESH_MS = 5_000;

export function Dashboard({
  initial,
  email,
}: {
  initial: DashboardData;
  email: string;
}) {
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

  function arrange(layout: Layout) {
    const placed = new Map(
      layout.flatMap((g) => g.keys.map((key, i) => [key, { group: g.name, i }]))
    );
    // Only groups whose tiles changed are saved, so the rest keep their labels' order
    const before = new Map(
      groups.map((g) => [g.name, g.services.map((s) => s.key)])
    );
    const moved = layout.filter(
      (g) => before.get(g.name)?.join('\n') !== g.keys.join('\n')
    );
    void change(
      (d) => ({
        ...d,
        groupOrder: layout.map((g) => g.name),
        services: d.services.map((s) => {
          const p = placed.get(s.key);
          return p ? { ...s, group: p.group, position: p.i } : s;
        }),
      }),
      () =>
        arrangeTiles({
          groups: layout.map((g) => g.name),
          tiles: moved.map((g) => ({ group: g.name, keys: g.keys })),
        }),
      "Couldn't save where tiles go"
    );
  }

  function resize(service: Service, width: number, height: number) {
    void change(
      (d) => ({
        ...d,
        services: d.services.map((s) =>
          s.key === service.key ? { ...s, width, height } : s
        ),
      }),
      () => resizeTile(service.key, width, height),
      `Couldn't resize ${service.name}`
    );
  }

  function arrangeHost(keys: string[]) {
    void change(
      (d) => ({
        ...d,
        hostTiles: keys.flatMap(
          (k) => d.hostTiles.find((t) => t.key === k) ?? []
        ),
      }),
      () => arrangeHostTilesTo(keys),
      "Couldn't save where the server's tiles go"
    );
  }

  function resizeHost(key: string, size: TileSize) {
    const tile = data.hostTiles.find((t) => t.key === key);
    void change(
      (d) => ({
        ...d,
        hostTiles: d.hostTiles.map((t) =>
          t.key === key ? { ...t, ...size } : t
        ),
      }),
      () => resizeHostTile(key, size.width, size.height),
      `Couldn't resize ${tile?.name ?? key}`
    );
  }

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
      {(host || hostComing) && (
        <HostStatsBar
          host={host}
          tiles={data.hostTiles}
          services={services}
          editing={editing}
          onOpen={open}
          onArrange={arrangeHost}
          onResize={resizeHost}
        />
      )}
      <TilesView
        groups={groups}
        editing={editing}
        onOpen={open}
        onArrange={arrange}
        onResize={resize}
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
