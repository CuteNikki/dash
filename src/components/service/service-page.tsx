'use client';

import { useTranslations } from 'next-intl';
import dynamic from 'next/dynamic';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';

import {
  ArrowUpCircleIcon,
  EllipsisIcon,
  PencilIcon,
  PlayIcon,
  RefreshCwIcon,
  RotateCwIcon,
  SquareIcon,
  Trash2Icon,
} from 'lucide-react';

import {
  checkUpdate,
  reloadCaddyConfig,
  runContainerAction,
} from '@/actions/containers';
import { resetTile, restoreTile } from '@/actions/tiles';

import { useFormat } from '@/i18n/use-format';
import { useIssueText } from '@/i18n/use-issue-text';

import { DEFAULT_GROUP } from '@/lib/dashboard/groups';
import { isRunning, labelOf } from '@/lib/dashboard/status';
import { isSiteKey } from '@/lib/dashboard/tiles';
import type { ContainerAction } from '@/lib/docker/docker';
import { fetcher } from '@/lib/fetcher';
import { formatAddress, MEASURES, type Measure } from '@/lib/format';
import type { GitStatus } from '@/lib/git';
import type { HistoryRange } from '@/lib/monitor/ranges';
import { isCaddy } from '@/lib/stacks/caddy';
import type {
  DetailCell,
  Service,
  ServiceHistory,
  SiteUptime,
} from '@/lib/types';
import { updateLabel } from '@/lib/updates/describe';
import { cn } from '@/lib/utils';

import { HistoryChart } from '@/components/charts/history-chart';
import { RangePicker } from '@/components/charts/range-picker';
import { useCan } from '@/components/common/role';
import { ScrollFade } from '@/components/common/scroll-fade';
import { TextSkeleton } from '@/components/common/skeletons';
import { attempt } from '@/components/common/toasts';
import { useKept, useKeptShape } from '@/components/common/use-kept';
import { Trail } from '@/components/dashboard/trail';
import { AddressList } from '@/components/service/address-list';
import { AppDetails, Facts, Panel } from '@/components/service/app-details';
import { LogViewer } from '@/components/service/log-viewer';
import { PortList } from '@/components/service/port-list';
import { RemoveServiceDialog } from '@/components/service/remove-service-dialog';
import { ServiceIcon } from '@/components/service/service-icon';
import { StatePill } from '@/components/service/status-dot';
import { StopDialog } from '@/components/service/stop-dialog';
import { StoragePanel } from '@/components/service/storage-panel';
import { BucketBrowser } from '@/components/storage/bucket-browser';
import { Button, ButtonLabel } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UpdateDialog } from '@/components/updates/update-dialog';

// Fetched once a service's page opens, rather than with the page: the
// editor, its languages, diffs and Markdown are most of the dashboard's script
const FilesPanel = dynamic(() =>
  import('@/components/editor/files-panel').then((m) => m.FilesPanel)
);
const GitPanel = dynamic(() =>
  import('@/components/git/git-panel').then((m) => m.GitPanel)
);

/** A service's logs, usage and controls, over the dashboard. */
/**
 * A service's page in the dashboard: its usage, logs, files and controls, in
 * the room below the dashboard's header, with the way back above it.
 */
export function ServicePage({
  service,
  onCloseAction,
  onChangedAction,
  onEditAction,
  onGroupAction,
  tab,
}: {
  service?: Service;
  /** Back to the dashboard */
  onCloseAction: () => void;
  /** Back to the dashboard, showing only this group's services */
  onGroupAction: (group: string) => void;
  /** Called after an action, so the dashboard refreshes right away */
  onChangedAction: () => void;
  onEditAction: (service: Service) => void;
  /** A tab it opens on, rather than the one it was left on */
  tab?: 'logs';
}) {
  const t = useTranslations('service');
  const td = useTranslations('dashboard');
  // Its removal's window, here rather than in the body, so the service it's
  // removing can be held on to
  const [removing, setRemoving] = useState(false);
  const [last, setLast] = useState(service);
  if (service && service !== last) setLast(service);
  // Removing takes its containers down, and with them the service from the
  // dashboard's next look; the page stays on the last one seen until its
  // removal's closed, so what that printed and how it went aren't lost
  const shown = service ?? (removing ? last : undefined);
  if (!shown) return null;

  function close() {
    setRemoving(false);
    onCloseAction();
  }
  const groupName =
    shown.group === DEFAULT_GROUP ? td('otherGroup') : shown.group;

  return (
    <div className='flex min-h-0 flex-1 flex-col gap-3'>
      <Trail
        onDashboardAction={close}
        steps={[
          {
            label: groupName,
            title: t('groupOnly', { group: groupName }),
            onClick: () => {
              setRemoving(false);
              onGroupAction(shown.group);
            },
          },
          { label: shown.name },
        ]}
      />
      {/* The room below the dashboard's header on a computer; on a phone,
          where that would leave its tabs a few lines, a whole screen,
          scrolled to past the header */}
      <Card className='min-h-0 flex-1 gap-0 py-0 max-sm:h-dvh max-sm:flex-none'>
        <ServiceBody
          service={shown}
          confirmRemove={removing}
          setConfirmRemove={setRemoving}
          onChanged={onChangedAction}
          onRemoved={() => {
            onChangedAction();
            close();
          }}
          onEdit={onEditAction}
          tab={tab}
        />
      </Card>
    </div>
  );
}

function ServiceBody({
  service,
  confirmRemove,
  setConfirmRemove,
  onChanged,
  onRemoved,
  onEdit,
  tab,
}: {
  service: Service;
  /** Whether its removal's window is open */
  confirmRemove: boolean;
  setConfirmRemove: (open: boolean) => void;
  onChanged: () => void;
  /** Called once its stack is removed, which closes the window */
  onRemoved: () => void;
  onEdit: (service: Service) => void;
  tab?: 'logs';
}) {
  const tu = useTranslations('updates');
  const ta = useTranslations('actions');
  const t = useTranslations('service');
  const [pending, startTransition] = useTransition();
  const [checking, startCheck] = useTransition();
  const [confirmStop, setConfirmStop] = useState(false);
  const [confirmUpdate, setConfirmUpdate] = useState(false);
  const running = isRunning(service.state);
  // A website elsewhere: nothing to start or stop, only how it answers
  const site = !!service.site;
  // What their role may use: starting and stopping, or its files, git and
  // console too, which reach the whole server
  const may = useCan();
  const controls = may('control');
  const manages = may('manage');
  // The tab it was left on, kept per service while the page is open, unless
  // it's opened at its logs; one that's not there, or not theirs, is Usage
  const [openTab, setOpenTab] = useKept<string>(
    `tab:${service.key}`,
    'usage',
    tab
  );
  // How far back the Usage tab's charts look, picked beside the tabs
  const [range, setRange] = useState<UsageRange>('live');
  // The repository its stack is in, if any: a Git tab shows once it's known
  const { data: git, mutate: rereadGit } = useSWR<GitStatus | null>(
    service.stack && manages
      ? `/api/containers/${service.containerId}/git`
      : null,
    fetcher,
    { revalidateOnFocus: false }
  );
  // While that's read, its tab as it was last time, so the tabs don't move
  const lastGit = useKeptShape(
    `git:${service.containerId}`,
    git === undefined
      ? undefined
      : { repo: !!git, changes: git?.changes.length },
    { repo: false, changes: 0 }
  );

  // The kept tab while it's there for them to see; Usage otherwise
  const shownTab =
    openTab === 'logs' ||
    (openTab === 'files' && service.stack && manages) ||
    (openTab === 'git' && git && manages) ||
    (openTab === 'browse' && service.browse && manages)
      ? openTab
      : 'usage';

  // New commits rebuild the whole stack, which only they may
  const canUpdate =
    !!service.update &&
    controls &&
    (service.update.kind !== 'commits' || manages);
  const removable = (service.removable || site) && manages;
  // Whether its menu has anything in it, for those who may do little
  const more =
    (!site && controls) || (isCaddy(service.image) && manages) || manages;

  function run(action: ContainerAction) {
    startTransition(() =>
      attempt(ta('failed', { action, name: service.name }), async () => {
        const result = await runContainerAction(service.containerId, action);
        if (result.ok)
          toast.success(ta('done', { action, name: service.name }));
        else
          toast.error(ta('failed', { action, name: service.name }), {
            description: result.error,
          });
        onChanged();
      })
    );
  }

  /** A website is only its tile: removing it forgets that, with Undo. */
  function removeSite() {
    startTransition(() =>
      attempt(t('removeFailed', { name: service.name }), async () => {
        const before = await resetTile(service.key);
        toast.success(t('removed', { name: service.name }), {
          action: before && {
            label: t('undo'),
            onClick: () =>
              attempt(t('restoreFailed', { name: service.name }), async () => {
                await restoreTile(before);
                toast.success(t('restored', { name: service.name }));
                onChanged();
              }),
          },
        });
        onRemoved();
      })
    );
  }

  /** Looks for its update now, rather than in a few hours with the rest. */
  function checkForUpdate() {
    startCheck(() =>
      attempt(t('checkFailed', { name: service.name }), async () => {
        const result = await checkUpdate(service.containerId);
        if (!result.ok) {
          toast.error(t('checkFailed', { name: service.name }), {
            description: result.error,
          });
        } else if (result.update) {
          toast.success(t('foundUpdate', { name: service.name }), {
            description: updateLabel(result.update, tu),
          });
        } else toast.success(t('upToDate', { name: service.name }));
        onChanged();
      })
    );
  }

  function reloadConfig() {
    startTransition(() =>
      attempt(t('reloadFailed'), async () => {
        const result = await reloadCaddyConfig(service.containerId);
        if (result.ok) toast.success(t('reloaded'));
        else
          toast.error(t('reloadFailed'), {
            description: result.error,
          });
      })
    );
  }

  return (
    <>
      <header className='flex flex-col gap-3 border-b p-4'>
        {/* Its name and state, and beside them what can be done, on one line
            where there's room; on a phone, the actions on a line below */}
        <div className='flex flex-wrap items-center gap-x-4 gap-y-3'>
          <div className='flex min-w-0 flex-1 basis-60 items-center gap-3'>
            <ServiceIcon
              icon={service.icon}
              variants={service.iconVariants}
              missing={service.iconMissing}
              name={service.name}
              className='size-10'
            />
            <div className='min-w-0'>
              <div className='flex items-center gap-2'>
                <h2 className='truncate text-base font-medium'>
                  {service.name}
                </h2>
                <StatePill state={service.state} label={labelOf(service)} />
              </div>
              {/* Its container, or a website's host */}
              <p className='truncate font-mono text-muted-foreground'>
                {service.containerName}
              </p>
            </div>
          </div>
          {/* The one most likely wanted stands out: the update when there's
              one, else Start when it's stopped; Restart beside it, and the
              rest in the menu, Remove last and apart */}
          <div className='flex items-center gap-2 max-sm:w-full'>
            {!site && controls && running && (
              <Button
                variant='outline'
                disabled={pending}
                onClick={() => run('restart')}
                aria-label={t('restart')}
              >
                <RotateCwIcon />
                {/* Its icon alone on a phone, beside an update's longer name */}
                <ButtonLabel hideOn='screen'>{t('restart')}</ButtonLabel>
              </Button>
            )}
            {!site && controls && !running && (
              <Button disabled={pending} onClick={() => run('start')}>
                <PlayIcon />
                {t('start')}
              </Button>
            )}
            {canUpdate && (
              <Button disabled={pending} onClick={() => setConfirmUpdate(true)}>
                <ArrowUpCircleIcon />
                {t('update')}
                <span className='font-mono'>
                  {updateLabel(service.update!, tu)}
                </span>
              </Button>
            )}
            {more && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant='outline'
                    size='icon'
                    aria-label={t('more')}
                    className='max-sm:ml-auto'
                  >
                    <EllipsisIcon />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align='end' className='w-max'>
                  {!site && controls && running && (
                    <DropdownMenuItem
                      disabled={pending}
                      onSelect={() => setConfirmStop(true)}
                    >
                      <SquareIcon />
                      {t('stop')}
                    </DropdownMenuItem>
                  )}
                  {isCaddy(service.image) && manages && (
                    <DropdownMenuItem
                      disabled={pending || !running}
                      title={t('reloadTitle')}
                      onSelect={reloadConfig}
                    >
                      <RefreshCwIcon />
                      {t('reloadConfig')}
                    </DropdownMenuItem>
                  )}
                  {/* Until there's one to run, as one found's Update takes its place */}
                  {!site && controls && !service.update && (
                    <DropdownMenuItem
                      disabled={checking}
                      title={service.updateError}
                      onSelect={checkForUpdate}
                    >
                      <RefreshCwIcon
                        className={cn(checking && 'animate-spin')}
                      />
                      {t('checkForUpdates')}
                    </DropdownMenuItem>
                  )}
                  {manages && (
                    <DropdownMenuItem onSelect={() => onEdit(service)}>
                      <PencilIcon />
                      {t('editTile')}
                    </DropdownMenuItem>
                  )}
                  {removable && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant='destructive'
                        disabled={pending}
                        onSelect={() =>
                          site ? removeSite() : setConfirmRemove(true)
                        }
                      >
                        <Trash2Icon />
                        {t('remove')}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        {service.addresses.length > 0 && (
          <AddressList addresses={service.addresses} />
        )}
      </header>

      {site ? (
        <div className='min-h-0 flex-1 p-4'>
          <ScrollFade
            fill
            className='h-full overflow-x-hidden overflow-y-auto'
            fadeFrom='from-card'
          >
            <SitePanel service={service} />
          </ScrollFade>
        </div>
      ) : (
        <Tabs
          value={shownTab}
          onValueChange={setOpenTab}
          className='min-h-0 flex-1 gap-4 p-4'
        >
          {/* The tabs, and on Usage how far back its charts look, on the
              tabs' line where there's room for both, else under them */}
          <div className='flex flex-wrap items-center justify-between gap-2'>
            <TabsList>
              <TabsTrigger value='usage'>{t('usage')}</TabsTrigger>
              <TabsTrigger value='logs'>
                {service.console && manages ? t('console') : t('logs')}
              </TabsTrigger>
              {service.stack && manages && (
                <TabsTrigger value='files'>{t('files')}</TabsTrigger>
              )}
              {service.browse && manages && (
                <TabsTrigger value='browse'>{t('browse')}</TabsTrigger>
              )}
              {git ? (
                <TabsTrigger value='git'>
                  Git
                  {git.changes.length > 0 && (
                    <span className='font-mono text-muted-foreground tabular-nums'>
                      {git.changes.length}
                    </span>
                  )}
                </TabsTrigger>
              ) : (
                git === undefined &&
                manages &&
                service.stack &&
                lastGit.repo && (
                  <TabsTrigger value='git' disabled>
                    Git
                    {!!lastGit.changes && (
                      <span
                        className='font-mono'
                        style={{ width: `${String(lastGit.changes).length}ch` }}
                      >
                        <TextSkeleton className='w-full' />
                      </span>
                    )}
                  </TabsTrigger>
                )
              )}
            </TabsList>
            {shownTab === 'usage' && (
              <RangePicker
                ranges={USAGE_RANGES}
                value={range}
                onChangeAction={setRange}
              />
            )}
          </div>
          <TabsContent value='logs' className='flex min-h-0 flex-col'>
            <LogViewer
              key={service.containerId}
              containerId={service.containerId}
              commands={service.console && manages ? { running } : undefined}
            />
          </TabsContent>
          {service.stack && manages && (
            // Kept while another tab shows, hidden, so coming back finds the
            // file that was open, and any edits to it, as they were left
            <TabsContent
              value='files'
              forceMount
              className='flex min-h-0 flex-col data-[state=inactive]:hidden'
            >
              {/* By stack, so unsaved edits survive the container being recreated */}
              <FilesPanel
                key={service.stack.dir}
                containerId={service.containerId}
                stackDir={service.stack.dir}
                onDeployedAction={onChanged}
                onFilesChangedAction={() => void rereadGit()}
              />
            </TabsContent>
          )}
          {git && (
            // Likewise the commit that was being looked at. On a phone,
            // where its parts don't all fit, it scrolls as one page
            <TabsContent
              value='git'
              forceMount
              className='flex min-h-0 flex-col data-[state=inactive]:hidden max-sm:overflow-y-auto'
            >
              <GitPanel
                key={git.root}
                containerId={service.containerId}
                status={git}
                onChangedAction={rereadGit}
              />
            </TabsContent>
          )}
          {service.browse && manages && (
            <TabsContent value='browse' className='flex min-h-0 flex-col'>
              <BucketBrowser containerId={service.containerId} />
            </TabsContent>
          )}
          {/* Scrolls within the window, as the other tabs' panels do */}
          <TabsContent value='usage' className='min-h-0'>
            <ScrollFade
              fill
              className='h-full overflow-x-hidden overflow-y-auto'
              fadeFrom='from-card'
            >
              <UsagePanel service={service} range={range} />
            </ScrollFade>
          </TabsContent>
        </Tabs>
      )}

      {/* Kept once its update is done, to show how it went until closed */}
      <UpdateDialog
        service={service}
        open={confirmUpdate}
        onOpenChangeAction={setConfirmUpdate}
        onUpdatedAction={onChanged}
      />
      {service.removable && (
        <RemoveServiceDialog
          service={service}
          open={confirmRemove}
          onOpenChangeAction={setConfirmRemove}
          onRemovedAction={onRemoved}
        />
      )}
      <StopDialog
        name={service.name}
        open={confirmStop}
        onOpenChangeAction={setConfirmStop}
        onStopAction={() => run('stop')}
      />
    </>
  );
}

/** How far back a service's charts look: its live readings, or the monitor's record. */
type UsageRange = 'live' | HistoryRange;

const USAGE_RANGES = ['live', '6h', '24h', '7d'] as const;

/** One measure as a card: its current value, and a chart of it over a while. */
function UsageChart({
  label,
  value,
  values,
  times,
  measure,
  measuring,
  range = 'live',
  fit,
}: {
  label: string;
  value?: number;
  values?: (number | null)[];
  times?: number[];
  measure: Measure;
  /** Running, but not measured yet: its value's to come */
  measuring: boolean;
  /** How far back the chart looks */
  range?: UsageRange;
  /** Scaled to its own readings rather than from nothing, see HistoryChart */
  fit?: boolean;
}) {
  const tr = useTranslations('ranges');
  const words = tr(`words.${range}`);
  const format = useFormat();
  return (
    <Panel title={label}>
      <span className='flex items-baseline justify-between gap-2'>
        <span className='font-mono text-lg tabular-nums'>
          {value !== undefined ? (
            measure.format(value, format)
          ) : measuring ? (
            <TextSkeleton className='w-16' />
          ) : (
            '–'
          )}
        </span>
      </span>
      {/* The chart's room, kept until there are readings to draw */}
      <div className='h-16'>
        {values && times && (
          <HistoryChart
            label={tr('over', { label, words })}
            times={times}
            series={[{ label, values, measure }]}
            fit={fit}
            className='h-full text-foreground'
          />
        )}
      </div>
    </Panel>
  );
}

const SITE_RANGES = ['live', '24h', '7d', '30d'] as const;

/**
 * A website: its response time, over the last ten minutes or as far back as
 * a month; how it last answered; and its uptime, from the monitor's check a
 * minute: the share answered over a day, a week and a month, each stretch
 * of the range up or down, and the times it was down.
 */
function SitePanel({ service }: { service: Service }) {
  const t = useTranslations('service');
  const check = service.site?.check;
  const [range, setRange] = useState<UsageRange>('live');
  // The month's uptime comes with every range, so it's asked for at once
  const { data: uptime, error } = useSWR<SiteUptime>(
    `/api/sites/${encodeURIComponent(service.key)}?range=${range === 'live' ? '24h' : range}`,
    fetcher,
    { refreshInterval: 60_000, keepPreviousData: true }
  );
  const recorded = range === 'live' ? undefined : uptime?.history;
  const facts: { label: string; value: DetailCell }[] = [
    { label: t('status'), value: service.status },
    {
      label: t('address'),
      value: service.url ? formatAddress(service.url) : t('noneToCheck'),
    },
    ...(check ? [{ label: t('lastChecked'), value: { at: check.at } }] : []),
    { label: t('checked'), value: t('checkedEvery') },
  ];
  return (
    <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
      <div className='flex justify-end sm:col-span-2'>
        <RangePicker
          ranges={SITE_RANGES}
          value={range}
          onChangeAction={setRange}
        />
      </div>
      <UsageChart
        label={t('responseTime')}
        value={check?.ms}
        values={range === 'live' ? check?.history.ms : recorded?.ms}
        times={range === 'live' ? check?.history.at : recorded?.at}
        measure={MEASURES.response}
        measuring={!check && !!service.url}
        range={range}
      />
      <Panel title={t('website')}>
        <Facts facts={facts} />
      </Panel>
      <Panel title={t('uptime')} className='sm:col-span-2'>
        {error && !uptime ? (
          <p className='text-destructive'>{error.message}</p>
        ) : (
          <SiteUptimeView
            uptime={uptime}
            // The strip covers the range picked, the last day for the live one
            range={range === 'live' ? '24h' : (range as UptimeRange)}
          />
        )}
      </Panel>
      {/* An app on another machine on its host, as the stream relay */}
      {service.details && isRunning(service.state) && (
        <div className='flex min-w-0 flex-col gap-3 sm:col-span-2'>
          <AppDetails containerId={service.containerId} />
        </div>
      )}
    </div>
  );
}

type UptimeRange = SiteUptime['shares'][number]['range'];

/** The shares answered, a strip of the range's stretches, and the outages. */
function SiteUptimeView({
  uptime,
  range,
}: {
  uptime?: SiteUptime;
  range: UptimeRange;
}) {
  const issueText = useIssueText();
  const tr = useTranslations('ranges');
  const format = useFormat();
  const t = useTranslations('service');
  const strip = uptime?.history;
  return (
    <div className='flex flex-col gap-4'>
      <dl className='grid grid-cols-3 gap-3'>
        {(uptime?.shares ?? SHARE_SKELETONS).map((s) => (
          <div key={s.range} className='flex flex-col'>
            <dt className='text-muted-foreground'>{t(`share.${s.range}`)}</dt>
            <dd
              className={cn(
                'font-mono text-lg tabular-nums',
                s.up !== null && s.up < 0.99 && 'text-warning',
                s.up !== null && s.up < 0.9 && 'text-destructive'
              )}
            >
              {!uptime ? (
                <TextSkeleton className='w-16' />
              ) : s.up === null ? (
                '–'
              ) : (
                format.uptime(s.up)
              )}
            </dd>
          </div>
        ))}
      </dl>
      <div className='flex flex-col gap-1'>
        {/* Each stretch of the range, green when every check answered,
            amber when some didn't, red when none did, and faint without any */}
        <div
          role='img'
          aria-label={t('upAndDown', { words: tr(`words.${range}`) })}
          // Side by side, no gap, as a month is hundreds of them
          className='flex h-6 overflow-hidden rounded-sm'
        >
          {strip?.up.map((up, i) => (
            <span
              key={strip.at[i]}
              title={
                up === null
                  ? t('notChecked')
                  : `${format.past(strip.at[i])}: ${format.uptime(up)}`
              }
              className={cn(
                'flex-1',
                up === null
                  ? 'bg-muted-foreground/15'
                  : up >= 1
                    ? 'bg-success'
                    : up > 0
                      ? 'bg-warning'
                      : 'bg-destructive'
              )}
            />
          ))}
        </div>
        <span className='flex justify-between text-muted-foreground'>
          <span>{t(`stripStart.${range}`)}</span>
          <span>{t('now')}</span>
        </span>
      </div>
      <div className='flex flex-col gap-2'>
        <h4 className='text-muted-foreground'>{t('outages')}</h4>
        {!uptime ? (
          <TextSkeleton className='w-48' />
        ) : uptime.outages.length ? (
          <ul className='flex flex-col divide-y'>
            {uptime.outages.map((o) => (
              <li
                key={o.from}
                className='flex flex-wrap items-baseline gap-x-3 py-1.5 first:pt-0 last:pb-0'
              >
                <span className='font-mono tabular-nums'>
                  {format.past(o.from)}
                </span>
                <span
                  className={cn(
                    'text-muted-foreground',
                    !o.to && 'text-destructive'
                  )}
                >
                  {o.to
                    ? t('downFor', {
                        duration: format.duration((o.to - o.from) / 1000),
                      })
                    : t('stillDown')}
                </span>
                <span className='min-w-0 truncate text-muted-foreground'>
                  {issueText(o.reason)}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className='text-muted-foreground'>{t('noOutages')}</p>
        )}
      </div>
    </div>
  );
}

/** The shares' places while they're coming. */
const SHARE_SKELETONS = (['24h', '7d', '30d'] as const).map((range) => ({
  range,
  up: null,
}));

/**
 * What it uses and what it is, each a card, the same for every service: its
 * charts side by side, its container's facts and ports side by side below
 * them, and what its app has to say, when it has something, below that.
 */
function UsagePanel({
  service,
  range,
}: {
  service: Service;
  /** How far back its charts look, as picked beside the tabs */
  range: UsageRange;
}) {
  const tu = useTranslations('updates');
  const t = useTranslations('service');
  const usage = service.usage;
  const { data: history } = useSWR<ServiceHistory>(
    range === 'live'
      ? null
      : `/api/containers/${service.containerId}/history?range=${range}`,
    fetcher,
    { refreshInterval: 60_000, keepPreviousData: true }
  );
  const recorded = range === 'live' ? undefined : history;
  // A running one that hasn't been measured yet, as just after it starts
  const measuring =
    !usage && ['running', 'unhealthy', 'starting'].includes(service.state);
  const app = service.details && isRunning(service.state);
  const facts = [
    { label: t('status'), value: service.status },
    { label: t('image'), value: service.image },
    { label: t('container'), value: service.containerName },
    {
      label: t('stack'),
      value: service.stack?.dir ?? t('noStack'),
    },
    ...(service.version
      ? [{ label: t('version'), value: service.version }]
      : []),
    {
      label: t('updates'),
      value: service.update
        ? t('updateAvailable', { label: updateLabel(service.update, tu) })
        : service.updateError
          ? t('couldntCheck', { error: service.updateError })
          : t('noneFound'),
    },
  ];
  return (
    // Columns no wider than the window, whatever's in them
    <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
      <UsageChart
        label={t('cpu')}
        value={usage?.cpu}
        values={range === 'live' ? usage?.history.cpu : recorded?.cpu}
        times={range === 'live' ? usage?.history.at : recorded?.at}
        measure={MEASURES.cpu}
        measuring={measuring}
        range={range}
      />
      <UsageChart
        label={t('memory')}
        value={usage?.memory}
        values={range === 'live' ? usage?.history.memory : recorded?.memory}
        times={range === 'live' ? usage?.history.at : recorded?.at}
        range={range}
        // Fitted to its own readings, so its shape shows: a steady amount a
        // flat line, a leak a climb
        measure={MEASURES.memory}
        fit
        measuring={measuring}
      />
      {/* Its ports beside its facts where there's room, in a column of
          their own, as a list of them needs no more */}
      <div className='grid grid-cols-1 gap-3 sm:col-span-2 lg:grid-cols-[minmax(0,1fr)_20rem]'>
        <Panel
          title={t('container')}
          className={cn(!service.ports?.length && 'lg:col-span-2')}
        >
          <Facts facts={facts} />
        </Panel>
        {service.ports && service.ports.length > 0 && (
          <Panel title={t('ports')}>
            <PortList service={service} />
          </Panel>
        )}
      </div>
      {/* Not a website's, which keeps nothing on this server */}
      {service.containerId && !isSiteKey(service.key) && (
        <StoragePanel
          containerId={service.containerId}
          className='sm:col-span-2'
        />
      )}
      {app && (
        <div className='flex min-w-0 flex-col gap-3 sm:col-span-2'>
          <AppDetails containerId={service.containerId} />
        </div>
      )}
    </div>
  );
}
