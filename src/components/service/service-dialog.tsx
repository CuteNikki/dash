'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';

import {
  ArrowUpCircleIcon,
  ExternalLinkIcon,
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
import { isRunning, labelOf } from '@/lib/dashboard/status';
import type { ContainerAction } from '@/lib/docker/docker';
import { fetcher } from '@/lib/fetcher';
import {
  formatAddress,
  formatDuration,
  formatPast,
  formatUptime,
  MEASURES,
  type Measure,
} from '@/lib/format';
import type { GitStatus } from '@/lib/git';
import { HISTORY_RANGES, type HistoryRange } from '@/lib/monitor/ranges';
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
import { useKept } from '@/components/common/use-kept';
import { FilesPanel } from '@/components/editor/files-panel';
import { GitPanel } from '@/components/git/git-panel';
import { AddressList } from '@/components/service/address-list';
import { AppDetails, Facts, Panel } from '@/components/service/app-details';
import { LogViewer } from '@/components/service/log-viewer';
import { PortList } from '@/components/service/port-list';
import { RemoveServiceDialog } from '@/components/service/remove-service-dialog';
import { ServiceIcon } from '@/components/service/service-icon';
import { StatePill } from '@/components/service/status-dot';
import { BucketBrowser } from '@/components/storage/bucket-browser';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { UpdateDialog } from '@/components/updates/update-dialog';

const DONE: Record<ContainerAction, string> = {
  start: 'Started',
  stop: 'Stopped',
  restart: 'Restarted',
};

/** A service's logs, usage and controls, over the dashboard. */
export function ServiceDialog({
  service,
  onCloseAction,
  onChangedAction,
  onEditAction,
  tab,
  memoryTotal,
}: {
  service?: Service;
  onCloseAction: () => void;
  /** Called after an action, so the dashboard refreshes right away */
  onChangedAction: () => void;
  onEditAction: (service: Service) => void;
  /** A tab it opens on, rather than the one it was left on */
  tab?: 'logs';
  /** The server's memory, in bytes, which a container's is charted against */
  memoryTotal?: number;
}) {
  // Its removal's window, here rather than in the body, so the service it's
  // removing can be held on to
  const [removing, setRemoving] = useState(false);
  const [last, setLast] = useState(service);
  if (service && service !== last) setLast(service);
  // Removing takes its containers down, and with them the service from the
  // dashboard's next look; the window stays on the last one seen until its
  // removal's closed, so what that printed and how it went aren't lost
  const shown = service ?? (removing ? last : undefined);

  function close() {
    setRemoving(false);
    onCloseAction();
  }

  return (
    <Dialog open={!!shown} onOpenChange={(open) => !open && close()}>
      {/* Full screen on a phone, a large window in the middle on a computer */}
      <DialogContent
        className='flex h-full max-h-none max-w-full flex-col gap-0 overflow-hidden rounded-none p-0 sm:h-5/6 sm:max-w-7xl sm:rounded-xl'
        // Focus the window itself, not its first button, whose tooltip
        // would open with it; Tab still reaches every button
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).focus();
        }}
      >
        {shown && (
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
            memoryTotal={memoryTotal}
          />
        )}
      </DialogContent>
    </Dialog>
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
  memoryTotal,
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
  memoryTotal?: number;
}) {
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

  // The kept tab while it's there for them to see; Usage otherwise
  const shownTab =
    openTab === 'logs' ||
    (openTab === 'files' && service.stack && manages) ||
    (openTab === 'git' && git && manages) ||
    (openTab === 'browse' && service.browse && manages)
      ? openTab
      : 'usage';

  function run(action: ContainerAction) {
    startTransition(() =>
      attempt(`Couldn't ${action} ${service.name}`, async () => {
        const result = await runContainerAction(service.containerId, action);
        if (result.ok) toast.success(`${DONE[action]} ${service.name}`);
        else
          toast.error(`Couldn't ${action} ${service.name}`, {
            description: result.error,
          });
        onChanged();
      })
    );
  }

  /** A website is only its tile: removing it forgets that, with Undo. */
  function removeSite() {
    startTransition(() =>
      attempt(`Couldn't remove ${service.name}`, async () => {
        const before = await resetTile(service.key);
        toast.success(`Removed ${service.name}`, {
          action: before && {
            label: 'Undo',
            onClick: () =>
              attempt(`Couldn't restore ${service.name}`, async () => {
                await restoreTile(before);
                toast.success(`Restored ${service.name}`);
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
      attempt(`Couldn't look for ${service.name}'s updates`, async () => {
        const result = await checkUpdate(service.containerId);
        if (!result.ok) {
          toast.error(`Couldn't look for ${service.name}'s updates`, {
            description: result.error,
          });
        } else if (result.update) {
          toast.success(`Found an update for ${service.name}`, {
            description: updateLabel(result.update),
          });
        } else toast.success(`${service.name} is up to date`);
        onChanged();
      })
    );
  }

  function reloadConfig() {
    startTransition(() =>
      attempt('Caddy kept its old config', async () => {
        const result = await reloadCaddyConfig(service.containerId);
        if (result.ok) toast.success('Caddy is using the new Caddyfile');
        else
          toast.error('Caddy kept its old config', {
            description: result.error,
          });
      })
    );
  }

  return (
    <>
      <DialogHeader className='gap-4 border-b p-4'>
        <div className='flex items-center gap-3 pr-8'>
          <ServiceIcon
            icon={service.icon}
            variants={service.iconVariants}
            missing={service.iconMissing}
            name={service.name}
            className='size-10'
          />
          <div className='min-w-0'>
            <DialogTitle className='truncate text-base'>
              {service.name}
            </DialogTitle>
            {/* Its container, or a website's host, alone, its state being
                with what changes it */}
            <DialogDescription className='truncate font-mono'>
              {service.containerName}
            </DialogDescription>
          </div>
        </div>
        {service.addresses.length > 0 && (
          <AddressList addresses={service.addresses} />
        )}
        <div className='flex flex-wrap items-center gap-2'>
          {/* As tall as the buttons beside it, its text level with theirs */}
          <StatePill
            state={service.state}
            label={labelOf(service)}
            className='mr-1 h-7 items-center px-3'
          />
          {site || !controls ? null : running ? (
            <Button
              variant='destructive'
              disabled={pending}
              onClick={() => setConfirmStop(true)}
            >
              <SquareIcon />
              Stop
            </Button>
          ) : (
            <Button
              variant='success'
              disabled={pending}
              onClick={() => run('start')}
            >
              <PlayIcon />
              Start
            </Button>
          )}
          {!site && controls && (
            <Button
              variant='warning'
              disabled={pending || !running}
              onClick={() => run('restart')}
            >
              <RotateCwIcon />
              Restart
            </Button>
          )}
          {isCaddy(service.image) && manages && (
            <Button
              variant='outline'
              disabled={pending || !running}
              title='Reads the Caddyfile again without restarting, so no site goes down'
              onClick={reloadConfig}
            >
              <RefreshCwIcon />
              Reload config
            </Button>
          )}
          {manages && (
            <Button variant='outline' onClick={() => onEdit(service)}>
              <PencilIcon />
              Edit tile
            </Button>
          )}
          {/* Until there's one to run, as one found's Update takes its place */}
          {!site && controls && !service.update && (
            <Button
              variant='outline'
              disabled={checking}
              title={service.updateError}
              onClick={checkForUpdate}
            >
              <RefreshCwIcon className={cn(checking && 'animate-spin')} />
              Check for updates
            </Button>
          )}
          {/* New commits rebuild the whole stack, which only they may */}
          {service.update &&
            controls &&
            (service.update.kind !== 'commits' || manages) && (
              <Button
                variant='outline'
                disabled={pending}
                onClick={() => setConfirmUpdate(true)}
                className='text-update hover:text-update'
              >
                <ArrowUpCircleIcon />
                Update
                <span className='font-mono'>{updateLabel(service.update)}</span>
              </Button>
            )}
          {(service.removable || site) && manages && (
            <Button
              variant='destructive'
              disabled={pending}
              onClick={() => (site ? removeSite() : setConfirmRemove(true))}
            >
              <Trash2Icon />
              Remove
            </Button>
          )}
          {service.url && (
            <Button variant='outline' className='ml-auto' asChild>
              <a href={service.url} target='_blank' rel='noreferrer'>
                <ExternalLinkIcon />
                Open
              </a>
            </Button>
          )}
        </div>
      </DialogHeader>

      {site ? (
        <div className='min-h-0 flex-1 p-4'>
          <ScrollFade
            fill
            className='h-full overflow-x-hidden overflow-y-auto'
            fadeFrom='from-popover'
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
              <TabsTrigger value='usage'>Usage</TabsTrigger>
              <TabsTrigger value='logs'>
                {service.console && manages ? 'Console' : 'Logs'}
              </TabsTrigger>
              {service.stack && manages && (
                <TabsTrigger value='files'>Files</TabsTrigger>
              )}
              {service.browse && manages && (
                <TabsTrigger value='browse'>Browse</TabsTrigger>
              )}
              {git && (
                <TabsTrigger value='git'>
                  Git
                  {git.changes.length > 0 && (
                    <span className='font-mono text-muted-foreground tabular-nums'>
                      {git.changes.length}
                    </span>
                  )}
                </TabsTrigger>
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
            // Likewise the commit that was being looked at
            <TabsContent
              value='git'
              forceMount
              className='flex min-h-0 flex-col data-[state=inactive]:hidden'
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
              fadeFrom='from-popover'
            >
              <UsagePanel
                service={service}
                memoryTotal={memoryTotal}
                range={range}
              />
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
      <AlertDialog open={confirmStop} onOpenChange={setConfirmStop}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Stop {service.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              It stays stopped until you start it again, including after the
              server restarts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => run('stop')}
            >
              Stop
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** How far back a service's charts look: its live readings, or the monitor's record. */
type UsageRange = 'live' | HistoryRange;

const USAGE_RANGES = ['live', '6h', '24h', '7d'] as const;

const LIVE_WORDS = 'the last ten minutes';

const rangeWords = (range: UsageRange) =>
  range === 'live' ? LIVE_WORDS : HISTORY_RANGES[range].words;

/** One measure as a card: its current value, and a chart of it over a while. */
function UsageChart({
  label,
  value,
  values,
  times,
  measure,
  measuring,
  words = LIVE_WORDS,
}: {
  label: string;
  value?: number;
  values?: (number | null)[];
  times?: number[];
  measure: Measure;
  /** Running, but not measured yet: its value's to come */
  measuring: boolean;
  /** What the chart covers: "the last day" */
  words?: string;
}) {
  return (
    <Panel title={label}>
      <span className='flex items-baseline justify-between gap-2'>
        <span className='font-mono text-lg tabular-nums'>
          {value !== undefined ? (
            measure.format(value)
          ) : measuring ? (
            <TextSkeleton className='w-16' />
          ) : (
            '–'
          )}
        </span>
        <span className='text-muted-foreground'>
          {words.replace(/^the /, '')}
        </span>
      </span>
      {/* The chart's room, kept until there are readings to draw */}
      <div className='h-16'>
        {values && times && (
          <HistoryChart
            label={`${label} over ${words}`}
            times={times}
            series={[{ label, values, measure }]}
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
  const check = service.site?.check;
  const [range, setRange] = useState<UsageRange>('live');
  // The month's uptime comes with every range, so it's asked for at once
  const { data: uptime, error } = useSWR<SiteUptime>(
    `/api/sites/${encodeURIComponent(service.key)}?range=${range === 'live' ? '24h' : range}`,
    fetcher,
    { refreshInterval: 60_000, keepPreviousData: true }
  );
  const recorded = range === 'live' ? undefined : uptime?.history;
  const words = rangeWords(range);
  const facts: { label: string; value: DetailCell }[] = [
    { label: 'Status', value: service.status },
    {
      label: 'Address',
      value: service.url ? formatAddress(service.url) : 'None to check',
    },
    ...(check ? [{ label: 'Last checked', value: { at: check.at } }] : []),
    {
      label: 'Checked',
      value: 'Every minute, every 30 s while open',
    },
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
        label='Response time'
        value={check?.ms}
        values={range === 'live' ? check?.history.ms : recorded?.ms}
        times={range === 'live' ? check?.history.at : recorded?.at}
        measure={MEASURES.response}
        measuring={!check && !!service.url}
        words={words}
      />
      <Panel title='Website'>
        <Facts facts={facts} />
      </Panel>
      <Panel title='Uptime' className='sm:col-span-2'>
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
    </div>
  );
}

type UptimeRange = SiteUptime['shares'][number]['range'];

const SHARE_WORDS: Record<UptimeRange, string> = {
  '24h': 'Last day',
  '7d': 'Last week',
  '30d': 'Last month',
};

/** Where the strip starts, under its left end. */
const STRIP_START: Record<UptimeRange, string> = {
  '24h': 'A day ago',
  '7d': 'A week ago',
  '30d': 'A month ago',
};

/** The shares answered, a strip of the range's stretches, and the outages. */
function SiteUptimeView({
  uptime,
  range,
}: {
  uptime?: SiteUptime;
  range: UptimeRange;
}) {
  const strip = uptime?.history;
  return (
    <div className='flex flex-col gap-4'>
      <dl className='grid grid-cols-3 gap-3'>
        {(uptime?.shares ?? SHARE_SKELETONS).map((s) => (
          <div key={s.range} className='flex flex-col'>
            <dt className='text-muted-foreground'>{SHARE_WORDS[s.range]}</dt>
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
                formatUptime(s.up)
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
          aria-label={`Up and down over ${HISTORY_RANGES[range].words}`}
          // Side by side, no gap, as a month is hundreds of them
          className='flex h-6 overflow-hidden rounded-sm'
        >
          {strip?.up.map((up, i) => (
            <span
              key={strip.at[i]}
              title={
                up === null
                  ? 'Not checked'
                  : `${formatPast(strip.at[i])}: ${formatUptime(up)}`
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
          <span>{STRIP_START[range]}</span>
          <span>Now</span>
        </span>
      </div>
      <div className='flex flex-col gap-2'>
        <h4 className='text-muted-foreground'>Outages in the last month</h4>
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
                  {formatPast(o.from)}
                </span>
                <span
                  className={cn(
                    'text-muted-foreground',
                    !o.to && 'text-destructive'
                  )}
                >
                  {o.to
                    ? `for ${formatDuration((o.to - o.from) / 1000)}`
                    : 'still down'}
                </span>
                <span className='min-w-0 truncate text-muted-foreground'>
                  {o.reason}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className='text-muted-foreground'>None</p>
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
  memoryTotal,
  range,
}: {
  service: Service;
  memoryTotal?: number;
  /** How far back its charts look, as picked beside the tabs */
  range: UsageRange;
}) {
  const usage = service.usage;
  const { data: history } = useSWR<ServiceHistory>(
    range === 'live'
      ? null
      : `/api/containers/${service.containerId}/history?range=${range}`,
    fetcher,
    { refreshInterval: 60_000, keepPreviousData: true }
  );
  const recorded = range === 'live' ? undefined : history;
  const words = rangeWords(range);
  // A running one that hasn't been measured yet, as just after it starts
  const measuring =
    !usage && ['running', 'unhealthy', 'starting'].includes(service.state);
  const app = service.details && isRunning(service.state);
  const facts = [
    { label: 'Status', value: service.status },
    { label: 'Image', value: service.image },
    { label: 'Container', value: service.containerName },
    {
      label: 'Stack',
      value: service.stack?.dir ?? 'Not part of a compose stack',
    },
    ...(service.version ? [{ label: 'Version', value: service.version }] : []),
    {
      label: 'Updates',
      value: service.update
        ? `${updateLabel(service.update)} available`
        : service.updateError
          ? `Couldn't check: ${service.updateError}`
          : 'None found',
    },
  ];
  return (
    // Columns no wider than the window, whatever's in them
    <div className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
      <UsageChart
        label='CPU'
        value={usage?.cpu}
        values={range === 'live' ? usage?.history.cpu : recorded?.cpu}
        times={range === 'live' ? usage?.history.at : recorded?.at}
        measure={MEASURES.cpu}
        measuring={measuring}
        words={words}
      />
      <UsageChart
        label='Memory'
        value={usage?.memory}
        values={range === 'live' ? usage?.history.memory : recorded?.memory}
        times={range === 'live' ? usage?.history.at : recorded?.at}
        words={words}
        // Against the server's memory, so a steady amount sits as low as
        // its share is, rather than at the top of a scale it alone sets,
        // and a leak shows as a climb
        measure={
          memoryTotal
            ? { ...MEASURES.memory, floor: memoryTotal }
            : MEASURES.memory
        }
        measuring={measuring}
      />
      {/* Its ports beside its facts where there's room, in a column of
          their own, as a list of them needs no more */}
      <div className='grid grid-cols-1 gap-3 sm:col-span-2 lg:grid-cols-[minmax(0,1fr)_20rem]'>
        <Panel
          title='Container'
          className={cn(!service.ports?.length && 'lg:col-span-2')}
        >
          <Facts facts={facts} />
        </Panel>
        {service.ports && service.ports.length > 0 && (
          <Panel title='Ports'>
            <PortList service={service} />
          </Panel>
        )}
      </div>
      {app && (
        <div className='flex min-w-0 flex-col gap-3 sm:col-span-2'>
          <AppDetails containerId={service.containerId} />
        </div>
      )}
    </div>
  );
}
