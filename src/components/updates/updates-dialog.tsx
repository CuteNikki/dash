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
        what: `${updateLabel(update)} on ${update.upstream}`,
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
 * Every update waiting, each to run on its own or all together, one after
 * another, apart from new major versions, which are only run on their own.
 * What each prints shows below; the window stays open until they're done.
 */
export function UpdatesDialog({
  open,
  services,
  checkedAt,
  checking,
  selfUpdating,
  onCloseAction,
  onChangedAction,
}: {
  open: boolean;
  services: Service[];
  checkedAt?: number;
  checking: boolean;
  selfUpdating: boolean;
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
  const [output, setOutput] = useState<string[]>();
  const [running, setRunning] = useState(false);
  const [checkPending, startCheck] = useTransition();

  // Taken afresh each time it opens, and after Check now
  const [openedFor, setOpenedFor] = useState(false);
  if (open !== openedFor) {
    setOpenedFor(open);
    if (open) {
      setRows(updatable(services));
      setOutcomes({});
      setOutput(undefined);
    }
  }

  async function update(list: Row[], first?: Response) {
    setRunning(true);
    setOutput([]);
    // What the rows before printed, kept as one's followed again from its start
    let before: string[] = [];
    try {
      for (const row of list) {
        setOutcomes((o) => ({ ...o, [row.key]: 'running' }));
        // A rebuild followed has its row, though it may no longer be waiting
        setRows((r) => (r.includes(row) ? r : [...r, row]));
        const header = [...(before.length ? [''] : []), `— ${row.name}`];
        let lines = [...before, ...header];
        const show = (next: string[]) => {
          lines = next;
          setOutput(next);
        };
        show(lines);
        const exitCode = await runUpdate(
          row.service,
          (line) => show([...lines, line]),
          { first, onRestart: () => show([...before, ...header]) }
        ).catch(() => 1);
        before = lines;
        setOutcomes((o) => ({
          ...o,
          [row.key]: exitCode === 0 ? 'done' : 'failed',
        }));
        if (exitCode !== 0) toast.error(`Couldn't update ${row.name}`);
        onChangedAction();
      }
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
              <li key={row.key} className='flex items-center gap-3 px-3 py-2'>
                <ServiceIcon
                  icon={row.service.icon}
                  variants={row.service.iconVariants}
                  missing={row.service.iconMissing}
                  name={row.name}
                  className='size-6'
                />
                <div className='min-w-0 flex-1'>
                  <div className='truncate font-medium'>{row.name}</div>
                  <div className='truncate font-mono text-muted-foreground'>
                    {row.what}
                    {row.major && (
                      <span className='ml-2 font-sans text-warning'>
                        major version
                      </span>
                    )}
                  </div>
                </div>
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

        {output && <RunOutput lines={output} />}

        <DialogFooter>
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
