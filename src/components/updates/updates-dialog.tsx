'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { CheckIcon, RefreshCwIcon, XIcon } from 'lucide-react';

import { checkUpdates } from '@/actions/containers';
import { formatAgo } from '@/lib/format';
import { DASH_PROJECT } from '@/lib/site';
import type { Service } from '@/lib/types';
import { updateLabel } from '@/lib/updates/describe';

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
import { runUpdate } from '@/components/updates/update-dialog';

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
  // dash's own last, as it restarts dash
  const isDash = (r: Row) => r.service.stack?.project === DASH_PROJECT;
  return [...rows.values()].sort(
    (a, b) =>
      Number(isDash(a)) - Number(isDash(b)) || a.name.localeCompare(b.name)
  );
}

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
  onClose,
  onChanged,
}: {
  open: boolean;
  services: Service[];
  checkedAt?: number;
  checking: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  // The rows as the window opened, so one stays, done, once it's updated
  const [rows, setRows] = useState<Row[]>([]);
  const [outcomes, setOutcomes] = useState<Record<string, Outcome>>({});
  const [output, setOutput] = useState<string[]>();
  const [running, setRunning] = useState(false);
  const [checkPending, startCheck] = useTransition();

  // Taken afresh each time it opens, and after Check now
  const [openedFor, setOpenedFor] = useState(false);
  if (open !== openedFor) {
    setOpenedFor(open);
    if (open) {
      setRows(rowsOf(services));
      setOutcomes({});
      setOutput(undefined);
    }
  }

  async function update(list: Row[]) {
    setRunning(true);
    setOutput([]);
    try {
      for (const row of list) {
        setOutcomes((o) => ({ ...o, [row.key]: 'running' }));
        setOutput((lines) => [
          ...(lines ?? []),
          ...(lines?.length ? [''] : []),
          `— ${row.name}`,
        ]);
        const exitCode = await runUpdate(row.service, (line) =>
          setOutput((lines) => [...(lines ?? []), line])
        ).catch(() => 1);
        setOutcomes((o) => ({
          ...o,
          [row.key]: exitCode === 0 ? 'done' : 'failed',
        }));
        if (exitCode !== 0) toast.error(`Couldn't update ${row.name}`);
        onChanged();
      }
    } finally {
      setRunning(false);
    }
  }

  function checkNow() {
    startCheck(async () => {
      const result = await checkUpdates();
      if (!result.ok) {
        toast.error('Couldn’t look for updates', { description: result.error });
      }
      onChanged();
    });
  }

  // Check now's findings, once the dashboard has them
  const [seenServices, setSeenServices] = useState(services);
  if (services !== seenServices) {
    setSeenServices(services);
    if (!running && !Object.keys(outcomes).length) setRows(rowsOf(services));
  }

  const waiting = rows.filter((r) => !outcomes[r.key]);
  const all = waiting.filter((r) => !r.major);
  const failedChecks = services.filter((s) => s.updateError);

  return (
    // Not closed while it's updating, so nothing's cut off halfway
    <Dialog open={open} onOpenChange={(o) => !o && !running && onClose()}>
      <DialogContent className='flex flex-col sm:max-w-xl'>
        <DialogHeader>
          <DialogTitle>Updates</DialogTitle>
          <DialogDescription>
            {checking || checkPending
              ? 'Looking for updates…'
              : checkedAt
                ? `Looked ${formatAgo(checkedAt)}, and again every few hours while dash is open.`
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
          <p className='text-muted-foreground'>Everything’s up to date.</p>
        )}

        {failedChecks.length > 0 && (
          <div className='flex flex-col gap-1 text-muted-foreground'>
            <span>Couldn’t check:</span>
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
