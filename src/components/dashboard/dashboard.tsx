'use client';

import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';

import {
  ArrowUpCircleIcon,
  CheckIcon,
  LayoutGridIcon,
  ListIcon,
  LoaderIcon,
  PencilIcon,
  PlusIcon,
  XIcon,
} from 'lucide-react';

import {
  renameGroup,
  saveLayout,
  saveListOrder,
  type OrderInput,
  type TileResult,
} from '@/actions/tiles';

import { can, type Ability } from '@/lib/auth/roles';
import {
  DEFAULT_GROUP,
  groupNames,
  groupServices,
} from '@/lib/dashboard/groups';
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
import { LocaleSync } from '@/components/chrome/locale-sync';
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
import { Trail } from '@/components/dashboard/trail';
import { TroubleRows, VerdictLine } from '@/components/dashboard/verdict';
import { HostTileContent } from '@/components/host/host-stats';
import { SystemDialog } from '@/components/host/system-dialog';
import { NewServiceDialog } from '@/components/new-service/new-service-dialog';
import { ServicePage } from '@/components/service/service-page';
import { EmailNotice } from '@/components/settings/email-notice';
import { Button, ButtonLabel } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { UpdatesDialog } from '@/components/updates/updates-dialog';

/** How often the dashboard asks for fresh status and usage. */
const REFRESH_MS = 5_000;

/** A change made while editing: how it shows, and how it's saved. */
type Edit = {
  update: (data: DashboardData) => DashboardData;
  save: () => Promise<TileResult>;
  failed: string;
};

/** How long a return to the board waits for it to be tall enough to scroll back to where it was. */
const RESTORE_MS = 1000;

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
  const tHost = useTranslations('host');
  const t = useTranslations('dashboard');
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
  const { data: live = initial, mutate } = useSWR<DashboardData>(
    '/api/services',
    fetcher,
    { fallbackData: initial, refreshInterval: REFRESH_MS }
  );
  const [editing, setEditing] = useState(false);
  // What's been moved, resized and renamed while editing, saved on Done
  const [edits, setEdits] = useState<Edit[]>([]);
  const [saving, setSaving] = useState(false);
  // Shown over what's live, so its numbers keep moving meanwhile
  const data = useMemo(
    () => edits.reduce((d, e) => e.update(d), live),
    [edits, live]
  );

  // Once the dashboard's been updated, the page reloads into the new build,
  // whose actions this one can't call. Not while a window's open, as the
  // update's own output, nor while editing: on the next look after
  useEffect(() => {
    if (!live.build || live.build === initial.build || editing) return;
    if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
    window.location.reload();
  }, [live, initial.build, editing]);

  // Leaving with edits unsaved asks first
  useEffect(() => {
    if (!edits.length) return;
    const ask = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', ask);
    return () => window.removeEventListener('beforeunload', ask);
  }, [edits.length]);
  const [adding, setAdding] = useState(false);
  const [showUpdates, setShowUpdates] = useState(false);
  const [showSystem, setShowSystem] = useState(false);
  const [showAlerts, setShowAlerts] = useState(false);
  // The service whose page is open, by key, in the address, so Back returns
  // to the board and a page's link opens it; by key, so it follows the live
  // data and survives a recreated container
  const params = useSearchParams();
  const openKey = params.get('service') ?? undefined;
  // Logs, when opened from a row's Logs; otherwise the tab it was left on
  const openTab = params.get('tab') === 'logs' ? 'logs' : undefined;
  // Whether this page put it in the history, so going back is Back; and
  // where the board was scrolled to, to return to
  const pushed = useRef(false);
  // Going back by the trail's Dashboard, which is the whole board, even from
  // one group's: Back alone returns to where the page was opened from
  const toWholeBoard = useRef(false);
  const boardScroll = useRef(0);
  const [editKey, setEditKey] = useState<string>();

  const { services, groupOrder, host, hostComing } = data;
  const visible = useMemo(() => services.filter((s) => !s.hidden), [services]);
  const shown = editing ? services : visible;
  // One group's alone, when its name in a service page's trail was clicked
  const onlyGroup = params.get('group') ?? undefined;
  const groups = useMemo(
    () =>
      groupServices(shown, groupOrder).filter(
        (g) => !onlyGroup || g.name === onlyGroup
      ),
    [shown, groupOrder, onlyGroup]
  );
  const allGroups = useMemo(
    () => groupNames(services, groupOrder),
    [services, groupOrder]
  );
  const find = (key?: string) => services.find((s) => s.key === key);
  const updateCount = services.filter((s) => s.update).length;

  /** Shows a change at once, to be saved on Done or dropped on Cancel. */
  function change(update: Edit['update'], save: Edit['save'], failed: string) {
    setEdits((e) => [...e, { update, save, failed }]);
  }

  /** Saves the edits in the order they were made, then shows what was saved. */
  async function finish() {
    setSaving(true);
    for (const { save, failed } of edits) {
      const result = await save().catch(() => ({
        error: t('somethingWrong'),
      }));
      if (result?.error) toast.error(failed, { description: result.error });
    }
    await mutate();
    setEdits([]);
    setSaving(false);
    setEditing(false);
  }

  function cancel() {
    setEdits([]);
    setEditing(false);
  }
  // Off a phone's line while editing, which has no room for them beside
  // Cancel and Done, and nothing to do with editing
  const offWhileEditing = editing ? 'max-sm:hidden' : undefined;

  function saveCells({ cells, moved }: LayoutChange) {
    const at = (key: string, columns: number) => `${key} ${columns}`;
    const replaced = new Set(cells.map((c) => at(c.key, c.columns)));
    const groupOf = new Map(moved.map((m) => [m.key, m.group]));
    change(
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
      t('saveLayoutFailed')
    );
  }

  function saveOrder(order: OrderInput) {
    const at = new Map(order.services.map((s, i) => [s.key, i]));
    const moved = new Map(
      order.services.flatMap((s) => (s.group ? [[s.key, s.group]] : []))
    );
    change(
      (d) => ({
        ...d,
        groupOrder: order.groups,
        services: d.services.map((s) =>
          at.has(s.key)
            ? {
                ...s,
                position: at.get(s.key),
                group: moved.get(s.key) ?? s.group,
              }
            : s
        ),
      }),
      () => saveListOrder(order),
      t('saveOrderFailed')
    );
  }

  function rename(from: string, keys: string[], name: string) {
    const sectionKey = (group: string) => `section:group:${group}`;
    change(
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
      t('renameFailed', { name: from })
    );
  }

  const sections: BoardSection[] = [
    ...((host || hostComing) && !onlyGroup
      ? [
          {
            id: 'host',
            kind: 'host' as const,
            label: t('server'),
            tiles: data.hostTiles.map((t) => ({
              key: `host:${t.key}`,
              name: tHost(`tiles.${t.key}`),
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
      label: g.name === DEFAULT_GROUP ? t('otherGroup') : g.name,
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

  /** Opens a service's page, at its logs or the tab it was left on. */
  function show(service: Service, tab?: 'logs') {
    boardScroll.current = window.scrollY;
    const query = new URLSearchParams({ service: service.key });
    if (tab) query.set('tab', tab);
    window.history.pushState(null, '', `?${query}`);
    pushed.current = true;
    window.scrollTo(0, 0);
  }

  /** Back to the whole board, as Back would be when the page was opened here. */
  function hide() {
    if (pushed.current) {
      toWholeBoard.current = true;
      window.history.back();
    } else window.history.replaceState(null, '', window.location.pathname);
  }

  // Back on the board, however it got there: where it was scrolled to, once
  // the board's tall enough again, as its tiles take a few frames to lay out
  useEffect(() => {
    if (openKey) return;
    pushed.current = false;
    if (toWholeBoard.current) {
      toWholeBoard.current = false;
      if (window.location.search) {
        window.history.replaceState(null, '', window.location.pathname);
      }
    }
    const y = boardScroll.current;
    if (!y) return;
    const until = performance.now() + RESTORE_MS;
    let frame = requestAnimationFrame(function restore() {
      const room = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo(0, Math.min(y, room));
      if (room < y && performance.now() < until) {
        frame = requestAnimationFrame(restore);
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [openKey]);

  /** Back to the board as a list of just one group's services. */
  function showGroup(group: string) {
    // In place of the service's page in the history, so Back is the whole board
    window.history.replaceState(null, '', `?${new URLSearchParams({ group })}`);
    pushed.current = false;
    boardScroll.current = 0;
    window.scrollTo(0, 0);
  }

  /** The whole board again, after one group's alone. */
  function showAll() {
    window.history.replaceState(null, '', window.location.pathname);
  }

  function open(service: Service) {
    if (editing) setEditKey(service.key);
    else show(service);
  }
  const page = openKey ? find(openKey) : undefined;

  return (
    <RoleProvider role={me.role}>
      <LocaleSync chosen={me.locale} />
      {/* Wider screens get more columns of tiles, up to a width past which
          the page would only spread out: then it's centered */}
      {/* A service's page fills the screen's height, its tabs' panels scrolling within it */}
      <main
        className={cn(
          'mx-auto flex w-full max-w-[2200px] flex-col gap-8 px-4 py-6 sm:px-6',
          page && 'h-dvh'
        )}
      >
        {/* The heading and the buttons on one line where they fit; on a
          narrow screen, the buttons on a line of their own below */}
        <header className='flex flex-wrap items-center justify-between gap-3'>
          <h1>
            <Brand />
          </h1>
          {/* How everything's doing: between the name and the buttons where the
              line has room for all three, else on a line of its own below them */}
          {!editing && (
            <VerdictLine
              services={visible}
              alerts={may('server') ? data.alerts : undefined}
              system={data.system}
              className='max-xl:order-last max-xl:basis-full xl:mr-auto xl:ml-6'
            />
          )}
          {/* Closer together on a phone, where the line's room is short */}
          <div className='flex items-center gap-2'>
            <ToggleGroup
              type='single'
              variant='segmented'
              value={view}
              // Picking the shown one again would unpick it; keep one picked
              onValueChange={(v) => v && pickView(v as View)}
              aria-label={t('showAs')}
            >
              <ToggleGroupItem value='tiles' aria-label={t('tiles')}>
                <LayoutGridIcon />
              </ToggleGroupItem>
              <ToggleGroupItem value='list' aria-label={t('list')}>
                <ListIcon />
              </ToggleGroupItem>
            </ToggleGroup>
            {may('server') && (
              <AlertsButton
                open={data.alerts ?? []}
                onClickAction={() => setShowAlerts(true)}
                className={offWhileEditing}
              />
            )}
            {may('control') && (
              <Button
                variant='outline'
                aria-label={
                  updateCount
                    ? t('updatesWaiting', { count: updateCount })
                    : t('updates')
                }
                onClick={() => setShowUpdates(true)}
                className={cn(
                  'relative',
                  updateCount > 0 && 'text-update hover:text-update',
                  offWhileEditing
                )}
              >
                <ArrowUpCircleIcon />
                {/* Its icon alone on a phone, with how many are waiting */}
                <ButtonLabel hideOn='screen'>{t('updates')}</ButtonLabel>
                {updateCount > 0 && (
                  <ButtonCount count={updateCount} tone='update' />
                )}
              </Button>
            )}
            {may('manage') && (
              <Button
                variant='outline'
                aria-label={t('newService')}
                onClick={() => setAdding(true)}
                className={offWhileEditing}
              >
                <PlusIcon />
                {/* Its plus alone on a phone, where the header's room is short */}
                <ButtonLabel hideOn='screen'>{t('newService')}</ButtonLabel>
              </Button>
            )}
            {may('manage') && editing && (
              <Button
                variant='outline'
                aria-label={t('cancel')}
                title={t('cancelTitle')}
                disabled={saving}
                onClick={cancel}
              >
                <XIcon />
                <ButtonLabel hideOn='screen'>{t('cancel')}</ButtonLabel>
              </Button>
            )}
            {may('manage') && (
              <Button
                variant={editing ? 'default' : 'outline'}
                aria-pressed={editing}
                aria-label={editing ? t('done') : t('editDashboard')}
                disabled={saving}
                onClick={() => (editing ? void finish() : setEditing(true))}
              >
                {saving ? (
                  <LoaderIcon className='animate-spin' />
                ) : editing ? (
                  <CheckIcon />
                ) : (
                  <PencilIcon />
                )}
                {/* Its icon alone on a phone, as New service's plus is */}
                <ButtonLabel hideOn='screen'>
                  {editing ? t('done') : t('editDashboard')}
                </ButtonLabel>
              </Button>
            )}
            {/* In the account menu on a phone, where the line's too short for it */}
            <ThemeButton className='max-sm:hidden' />
            <AccountMenu me={me} />
            <EmailNotice me={me} />
          </div>
        </header>
        {/* Off while arranging, which is about where things go, not how they're doing */}
        {!editing && !page && (
          <TroubleRows
            services={visible}
            onOpenAction={open}
            onLogsAction={(service) => show(service, 'logs')}
            onChangedAction={() => mutate()}
          />
        )}
        {/* One group's alone: the same trail as a service's page, a step shorter */}
        {onlyGroup && !page && (
          <Trail
            onDashboardAction={showAll}
            steps={[
              {
                label:
                  onlyGroup === DEFAULT_GROUP ? t('otherGroup') : onlyGroup,
              },
            ]}
          />
        )}
        {!page && (
          <Board
            sections={sections}
            columns={columns}
            editing={editing}
            saved={data.layouts}
            onLayoutAction={saveCells}
            onRenameAction={(section, name) =>
              rename(
                section.label,
                section.tiles.map((t) => t.key),
                name
              )
            }
          />
        )}
        {view === 'list' && !page && (
          <ServiceList
            groups={groups}
            filter={filter}
            onFilterAction={pickFilter}
            editing={editing}
            onOpenAction={open}
            onLogsAction={(service) => show(service, 'logs')}
            onChangedAction={() => mutate()}
            onReorderAction={saveOrder}
            onRenameAction={rename}
          />
        )}
        <ServicePage
          service={page}
          tab={openTab}
          onCloseAction={hide}
          onChangedAction={() => void mutate()}
          onEditAction={(service) => setEditKey(service.key)}
          onGroupAction={showGroup}
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
          atOnce={data.updates?.atOnce ?? 1}
          onCloseAction={() => setShowUpdates(false)}
          onChangedAction={() => void mutate()}
        />
        <NewServiceDialog
          open={adding}
          groups={allGroups}
          onCloseAction={() => setAdding(false)}
          onCreatedAction={() => void mutate()}
        />
      </main>
    </RoleProvider>
  );
}
