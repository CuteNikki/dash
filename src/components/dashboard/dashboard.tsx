'use client';

import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';

import {
  ArrowUpCircleIcon,
  LayoutGridIcon,
  ListIcon,
  PencilIcon,
  PlusIcon,
} from 'lucide-react';

import { renameGroup, saveLayout, type TileResult } from '@/actions/tiles';
import { can, type Ability } from '@/lib/auth/roles';
import { groupNames, groupServices } from '@/lib/dashboard/groups';
import {
  FILTER_COOKIE,
  filterToCookie,
  VIEW_COOKIE,
  type ListFilter,
  type View,
} from '@/lib/dashboard/view';
import { fetcher } from '@/lib/fetcher';
import type { Dashboard as DashboardData, Me, Service } from '@/lib/types';
import { cn } from '@/lib/utils';

import { AlertsButton, AlertsDialog } from '@/components/alerts/alerts-dialog';
import { AccountMenu } from '@/components/chrome/account-menu';
import { Brand } from '@/components/chrome/brand';
import { ThemeButton } from '@/components/chrome/theme-button';
import { ButtonCount } from '@/components/common/button-count';
import { RoleProvider } from '@/components/common/role';
import {
  Board,
  useColumns,
  type BoardSection,
  type LayoutChange,
} from '@/components/dashboard/board';
import { EditTileDialog } from '@/components/dashboard/edit-tile-dialog';
import { ServiceList } from '@/components/dashboard/service-list';
import { ServiceTile } from '@/components/dashboard/service-tile';
import { HostTileContent } from '@/components/host/host-stats';
import { SystemDialog } from '@/components/host/system-dialog';
import { NewServiceDialog } from '@/components/new-service/new-service-dialog';
import { ServiceDialog } from '@/components/service/service-dialog';
import { EmailNotice } from '@/components/settings/email-notice';
import { Button, ButtonLabel } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { UpdatesDialog } from '@/components/updates/updates-dialog';

/** How often the dashboard asks for fresh status and usage. */
const REFRESH_MS = 5_000;

export function Dashboard({
  initial,
  initialColumns,
  initialView,
  initialFilter,
  me,
}: {
  initial: DashboardData;
  /** The columns the screen had last time, so the first paint has them */
  initialColumns: number;
  /** Tiles or the list, as picked last time */
  initialView: View;
  /** The list's filter, as picked last time */
  initialFilter: ListFilter;
  /** Whoever's signed in, whose role says what shows */
  me: Me;
}) {
  const columns = useColumns(initialColumns);
  // What their role may use shows; the server refuses the rest regardless
  const may = (ability: Ability) => can(me.role, ability);
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
  const [adding, setAdding] = useState(false);
  const [showUpdates, setShowUpdates] = useState(false);
  const [showSystem, setShowSystem] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  // By key, so these follow the live data and survive a recreated container
  const [openKey, setOpenKey] = useState<string>();
  // Logs, when opened from a row's Logs; otherwise the tab it was left on
  const [openTab, setOpenTab] = useState<'logs'>();
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
  const updateCount = services.filter((s) => s.update).length;

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
                  onOpenAction={open}
                  system={data.system}
                  onSystemAction={() => setShowSystem(true)}
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
      setOpenTab(undefined);
      setOpenKey(service.key);
    }
  }

  return (
    <RoleProvider role={me.role}>
      {/* Wider screens get more columns of tiles, up to a width past which
          the page would only spread out: then it's centered */}
      <div className='mx-auto flex w-full max-w-[2200px] flex-col gap-8 px-4 py-6 sm:px-6'>
        {/* The heading and the buttons on one line where they fit; on a
          narrow screen, the buttons on a line of their own below */}
        <header className='flex flex-wrap items-center justify-between gap-3'>
          <h1>
            <Brand />
          </h1>
          {/* Closer together on a phone, where the line's room is short */}
          <div className='flex items-center gap-2'>
            <ToggleGroup
              type='single'
              variant='segmented'
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
            {may('server') && (
              <AlertsButton
                open={data.alerts ?? []}
                onClickAction={() => setShowAlerts(true)}
              />
            )}
            {may('control') && (
              <Button
                variant='outline'
                aria-label={
                  updateCount ? `Updates, ${updateCount} waiting` : 'Updates'
                }
                onClick={() => setShowUpdates(true)}
                className={cn(
                  'relative',
                  updateCount > 0 && 'text-update hover:text-update'
                )}
              >
                <ArrowUpCircleIcon />
                {/* Its icon alone on a phone, with how many are waiting */}
                <ButtonLabel hideOn='screen'>Updates</ButtonLabel>
                {updateCount > 0 && (
                  <ButtonCount count={updateCount} tone='update' />
                )}
              </Button>
            )}
            {may('manage') && (
              <Button
                variant='outline'
                aria-label='New service'
                onClick={() => setAdding(true)}
              >
                <PlusIcon />
                {/* Its plus alone on a phone, where the header's room is short */}
                <ButtonLabel hideOn='screen'>New service</ButtonLabel>
              </Button>
            )}
            {may('manage') && (
              <Button
                variant={editing ? 'default' : 'outline'}
                aria-pressed={editing}
                aria-label={editing ? 'Done' : 'Edit'}
                onClick={() => setEditing(!editing)}
              >
                <PencilIcon />
                {/* Its pencil alone on a phone, as New service's plus is */}
                <ButtonLabel hideOn='screen'>
                  {editing ? 'Done' : 'Edit'}
                </ButtonLabel>
              </Button>
            )}
            {/* In the account menu on a phone, where the line's too short for it */}
            <ThemeButton className='max-sm:hidden' />
            <AccountMenu me={me} />
            <EmailNotice me={me} />
          </div>
        </header>
        <Board
          sections={sections}
          columns={columns}
          editing={editing}
          saved={data.layouts}
          onLayoutAction={saveCells}
          onRenameAction={rename}
        />
        {view === 'list' && (
          <ServiceList
            groups={groups}
            filter={filter}
            onFilterAction={pickFilter}
            editing={editing}
            onOpenAction={open}
            onLogsAction={(service) => {
              setOpenTab('logs');
              setOpenKey(service.key);
            }}
            onChangedAction={() => mutate()}
          />
        )}
        <ServiceDialog
          service={find(openKey)}
          tab={openTab}
          memoryTotal={host?.memory.total}
          onCloseAction={() => setOpenKey(undefined)}
          onChangedAction={() => void mutate()}
          onEditAction={(service) => {
            setOpenKey(undefined);
            setEditKey(service.key);
          }}
        />
        <EditTileDialog
          service={find(editKey)}
          groups={allGroups}
          onCloseAction={() => setEditKey(undefined)}
          onSavedAction={() => void mutate()}
        />
        <AlertsDialog
          open={showAlerts}
          mail={me.mail}
          onCloseAction={() => setShowAlerts(false)}
        />
        <SystemDialog
          open={showSystem}
          system={data.system}
          onCloseAction={() => setShowSystem(false)}
          onChangedAction={() => void mutate()}
        />
        <UpdatesDialog
          open={showUpdates}
          services={services}
          checkedAt={data.updates?.checkedAt}
          checking={data.updates?.checking ?? false}
          selfUpdating={data.updates?.selfUpdating ?? false}
          onCloseAction={() => setShowUpdates(false)}
          onChangedAction={() => void mutate()}
        />
        <NewServiceDialog
          open={adding}
          groups={allGroups}
          onCloseAction={() => setAdding(false)}
          onCreatedAction={() => void mutate()}
        />
      </div>
    </RoleProvider>
  );
}
