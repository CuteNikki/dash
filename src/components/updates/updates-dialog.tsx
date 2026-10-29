'use client';

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useTransition,
} from 'react';
import { toast } from 'sonner';

import { CheckIcon, RefreshCwIcon, XIcon } from 'lucide-react';

import { checkUpdates } from '@/actions/containers';
import { formatAgo } from '@/lib/format';
import { DASH_PROJECT } from '@/lib/site';
import type { Service } from '@/lib/types';
import { updateLabel } from '@/lib/updates/describe';
import { cn } from '@/lib/utils';

import { useCan } from '@/components/common/role';
import { RunOutput } from '@/components/common/run-output';
import { ServiceIcon } from '@/components/service/service-icon';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { runUpdate, SELF_UPDATE_URL } from '@/components/updates/update-dialog';

type Row = {
  key: string;
  /** The service whose update runs it: for a rebuild, any of its stack's */
  service: Service;
  name: string;
  what: string;
  major: boolean;
};

type Outcome = 'running' | 'done' | 'failed';

/**
 * One row for each update: a service's own, or a stack's, for those built
 * here, whose one rebuild updates all its services.
 */
function rowsOf(services: Service[]): Row[] {
  const rows = new Map<string, Row>();
  for (const service of services) {
    const update = service.update;
    if (!update) continue;
    if (update.kind === 'commits' && service.stack) {
      const key = `stack:${service.stack.project}`;
      const row = rows.get(key);
      if (row) {
        row.name = service.stack.project;
        continue;
      }
      rows.set(key, {
        key,
        service,
        name: service.name,
        what: update.behind
          ? `${updateLabel(update)} on ${update.upstream}`
          : `${update.upstream} pulled, rebuild failed`,
        major: false,
      });
      continue;
    }
    rows.set(service.key, {
      key: service.key,
      service,
      name: service.name,
      what:
        update.kind === 'version'
          ? `${update.from} → ${update.to}`
          : update.kind === 'image' && update.rebuilt
            ? `${update.to}, rebuilt`
            : update.kind === 'image' && service.version
              ? `${service.version} → ${update.to ?? `newer ${update.tag}`}`
              : updateLabel(update),
      major: update.kind === 'version' && update.major,
    });
  }
  // The dashboard's own last, as it restarts the dashboard
  return [...rows.values()].sort(
    (a, b) =>
      Number(isDashRow(a)) - Number(isDashRow(b)) ||
      a.name.localeCompare(b.name)
  );
}

const isDashRow = (r: Row) => r.service.stack?.project === DASH_PROJECT;

/**
 * Every update waiting, each to run on its own or all together, `atOnce` at
 * a time, apart from new major versions, which are only run on their own,
 * and the dashboard's own, which runs last and alone, as it restarts this
 * page. What each prints shows below, one's at a time, picked by its row;
 * the window stays open until they're done. All together, one that fails
 * stops any more starting until told to go on or not.
 */
export function UpdatesDialog({
  open,
  services,
  checkedAt,
  checking,
  selfUpdating,
  atOnce,
  onCloseAction,
  onChangedAction,
}: {
  open: boolean;
  services: Service[];
  checkedAt?: number;
  checking: boolean;
  selfUpdating: boolean;
  /** How many Update all runs at once */
  atOnce: number;
  onCloseAction: () => void;
  onChangedAction: () => void;
}) {
  // The rows as the window opened, so one stays, done, once it's updated
  const [rows, setRows] = useState<Row[]>([]);
  // New commits rebuild a whole stack, which only those who may change its
  // files can; the rest see what they can update
  const manages = useCan()('manage');
  const updatable = (list: Service[]) =>
    rowsOf(list).filter((r) => r.service.update?.kind !== 'commits' || manages);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  // What each row's update printed, by its key, and whose is shown
  const [outputs, setOutputs] = useState<Record<string, string[]>>({});
  const [shown, setShown] = useState<string>();
  // Once a row's been picked, its output stays shown as others start
  const picked = useRef(false);
  const [running, setRunning] = useState(false);
  // Update all, stopped at those that failed until it's told to go on or not
  const [failed, setFailed] = useState<{
    names: string[];
    resolve: (goOn: boolean) => void;
  }>();
  const [checkPending, startCheck] = useTransition();

  // Taken afresh each time it opens, and after Check now
  const [openedFor, setOpenedFor] = useState(false);
  if (open !== openedFor) {
    setOpenedFor(open);
    if (open) {
      setRows(updatable(services));
      setOutcomes({});
      setOutputs({});
      setShown(undefined);
    }
  }

  async function update(list: Row[], first?: Response) {
    setRunning(true);
    picked.current = false;
    // Asked once a run fails, whatever else fails while it waits; until
    // it's answered, nothing more starts
    let asking: Promise<void> | undefined;
    let stopped = false;
    const goOn = async () => {
      while (asking) await asking;
      return !stopped;
    };

    // Whether it worked
    async function run(row: Row, followed?: Response) {
      setOutcomes((o) => ({ ...o, [row.key]: 'running' }));
      // A rebuild followed has its row, though it may no longer be waiting
      setRows((r) => (r.includes(row) ? r : [...r, row]));
      if (!picked.current) setShown(row.key);
      let lines: string[] = [];
      const show = (next: string[]) => {
        lines = next;
        setOutputs((o) => ({ ...o, [row.key]: next }));
      };
      show([]);
      const exitCode = await runUpdate(
        row.service,
        (line) => show([...lines, line]),
        { first: followed, onRestart: () => show([]) }
      ).catch(() => 1);
      const ok = exitCode === 0;
      setOutcomes((o) => ({ ...o, [row.key]: ok ? 'done' : 'failed' }));
      onChangedAction();
      if (!ok) {
        toast.error(`Couldn't update ${row.name}`);
        setShown(row.key);
      }
      return ok;
    }

    // The dashboard's own last and alone, as its rebuild restarts this page
    const queue = list.filter((r) => !isDashRow(r));
    const dash = list.find(isDashRow);
    const ask = (row: Row) => {
      // Only while there's more to start, which waits for the answer
      if (!queue.length && !dash) return;
      if (asking) {
        setFailed((f) => f && { ...f, names: [...f.names, row.name] });
        return;
      }
      asking = new Promise<boolean>((resolve) =>
        setFailed({ names: [row.name], resolve })
      ).then((yes) => {
        stopped = !yes;
        asking = undefined;
        setFailed(undefined);
      });
    };
    try {
      await Promise.all(
        Array.from({ length: Math.min(atOnce, queue.length) }, async () => {
          while (await goOn()) {
            const row = queue.shift();
            if (!row) return;
            if (!(await run(row))) ask(row);
          }
        })
      );
      if (dash && (await goOn())) await run(dash, first);
    } finally {
      setRunning(false);
    }
  }

  // The dashboard's own rebuild, going on as the window opens, as when it's
  // opened again or the dashboard restarted on the new build, is followed
  // straight away, in a row of its own if it's no longer waiting
  const followed = useRef(false);
  const followRebuild = useEffectEvent(() => {
    if (running || followed.current) return;
    const dash = services.find(
      (s) => s.stack?.project === DASH_PROJECT && s.state === 'running'
    );
    if (!dash) return;
    followed.current = true;
    const row = rows.find(isDashRow) ?? {
      key: `stack:${DASH_PROJECT}`,
      service: dash,
      name: dash.name,
      what: 'Rebuilding',
      major: false,
    };
    // Once it answers, as following it is waiting on the server
    void fetch(SELF_UPDATE_URL)
      .then((res) => update([row], res))
      .catch(() => (followed.current = false));
  });
  // Only as it opens, or learns one is going on
  useEffect(() => {
    if (!open) {
      followed.current = false;
      return;
    }
    if (selfUpdating) followRebuild();
  }, [open, selfUpdating]);

  function checkNow() {
    startCheck(async () => {
      const result = await checkUpdates();
      if (!result.ok) {
        toast.error("Couldn't look for updates", { description: result.error });
      }
      onChangedAction();
    });
  }

  // Check now's findings, once the dashboard has them
  const [seenServices, setSeenServices] = useState(services);
  if (services !== seenServices) {
    setSeenServices(services);
    if (!running && !Object.keys(outcomes).length) setRows(updatable(services));
  }

  const waiting = rows.filter((r) => !outcomes[r.key]);
  const all = waiting.filter((r) => !r.major);
  const failedChecks = services.filter((s) => s.updateError);

  return (
    // Not closed while it's updating, so nothing's cut off halfway
    <Dialog open={open} onOpenChange={(o) => !o && !running && onCloseAction()}>
      <DialogContent className='flex flex-col sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>Updates</DialogTitle>
          <DialogDescription>
            {checking || checkPending
              ? 'Looking for updates…'
              : checkedAt
                ? `Looked ${formatAgo(checkedAt)}, and again every few hours while the dashboard is open.`
                : 'Not looked for yet.'}
          </DialogDescription>
        </DialogHeader>

        {rows.length ? (
          <ul className='flex flex-col divide-y rounded-lg border'>
            {rows.map((row) => (
              <li
                key={row.key}
                className={cn(
                  'flex items-center gap-3 px-3 py-2',
                  // The one whose output shows, while there's more than one's
                  row.key === shown &&
                    Object.keys(outputs).length > 1 &&
                    'bg-muted/50'
                )}
              >
                <ServiceIcon
                  icon={row.service.icon}
                  variants={row.service.iconVariants}
                  missing={row.service.iconMissing}
                  name={row.name}
                  className='size-6'
                />
                <button
                  type='button'
                  // Shows what its update printed, once it's printed anything
                  disabled={!outputs[row.key]}
                  onClick={() => {
                    picked.current = true;
                    setShown(row.key);
                  }}
                  className='min-w-0 flex-1 text-left disabled:cursor-default'
                >
                  <span className='block truncate font-medium'>{row.name}</span>
                  <span className='block truncate font-mono text-muted-foreground'>
                    {row.what}
                    {row.major && (
                      <span className='ml-2 font-sans text-warning'>
                        major version
                      </span>
                    )}
                  </span>
                </button>
                <RowAction
                  outcome={outcomes[row.key]}
                  disabled={running}
                  onUpdate={() => void update([row])}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className='text-muted-foreground'>Everything's up to date.</p>
        )}

        {failedChecks.length > 0 && (
          <div className='flex flex-col gap-1 text-muted-foreground'>
            <span>Couldn't check:</span>
            {failedChecks.map((s) => (
              <span key={s.key} className='truncate'>
                {s.name}: {s.updateError}
              </span>
            ))}
          </div>
        )}

        {shown && outputs[shown] && <RunOutput lines={outputs[shown]} />}

        {failed && (
          <p className='text-destructive'>
            {failed.names.join(', ')} didn't update; pick its row to see its
            output. Go on with the rest?
          </p>
        )}

        <DialogFooter>
          {failed ? (
            <>
              <Button
                variant='outline'
                onClick={() => failed.resolve(false)}
                className='sm:mr-auto'
              >
                Stop here
              </Button>
              <Button onClick={() => failed.resolve(true)}>
                Go on with the rest
              </Button>
            </>
          ) : (
            <>
              <Button
                variant='outline'
                disabled={running || checking || checkPending}
                onClick={checkNow}
                className='sm:mr-auto'
              >
                <RefreshCwIcon className={checkPending ? 'animate-spin' : ''} />
                Check now
              </Button>
              {all.length > 0 && (
                <Button disabled={running} onClick={() => void update(all)}>
                  {running
                    ? 'Updating…'
                    : `Update all${all.length > 1 ? ` ${all.length}` : ''}`}
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RowAction({
  outcome,
  disabled,
  onUpdate,
}: {
  outcome?: Outcome;
  disabled: boolean;
  onUpdate: () => void;
}) {
  if (outcome === 'done') {
    return <CheckIcon aria-label='Updated' className='size-4 text-success' />;
  }
  if (outcome === 'failed') {
    return <XIcon aria-label='Failed' className='size-4 text-destructive' />;
  }
  return (
    <Button variant='outline' size='sm' disabled={disabled} onClick={onUpdate}>
      {outcome === 'running' ? 'Updating…' : 'Update'}
    </Button>
  );
}
