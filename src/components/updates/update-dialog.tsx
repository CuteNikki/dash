'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { ExternalLinkIcon } from 'lucide-react';

import { readRunStream } from '@/lib/docker/read-run-stream';
import type { Service } from '@/lib/types';
import { releasesUrl, updateDescription } from '@/lib/updates/describe';

import { RunOutput } from '@/components/common/run-output';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';

/** Updates a service on the server, passing on each line it prints; its exit code. */
export async function runUpdate(
  service: Service,
  onLine: (line: string) => void
) {
  const res = await fetch(`/api/containers/${service.containerId}/update`, {
    method: 'POST',
  });
  return readRunStream(res, onLine);
}

type Outcome = 'done' | 'failed';

/**
 * Asks before updating a service, saying what it'll do, with a link to
 * what's new for a new version; then shows what the server does as it goes,
 * and stays, with how it went, until it's closed. The update is the one it
 * opened with, as the service's own is gone once it's done.
 */
export function UpdateDialog({
  service,
  open,
  onOpenChangeAction,
  onUpdatedAction,
}: {
  service: Service;
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
  onUpdatedAction: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<string[]>();
  const [outcome, setOutcome] = useState<Outcome>();
  const [shown, setShown] = useState(service);

  // Taken afresh each time it opens
  const [openedFor, setOpenedFor] = useState(false);
  if (open !== openedFor) {
    setOpenedFor(open);
    if (open) {
      setShown(service);
      setOutput(undefined);
      setOutcome(undefined);
    }
  }

  const update = shown.update;
  if (!update) return null;
  const notes = update.kind === 'version' && releasesUrl(update.source);

  async function start() {
    setOutput([]);
    setOutcome(undefined);
    setRunning(true);
    try {
      const exitCode = await runUpdate(shown, (line) =>
        setOutput((lines) => [...(lines ?? []), line])
      ).catch(() => 1);
      if (exitCode === 0) {
        setOutcome('done');
        toast.success(`Updated ${shown.name}`);
        onUpdatedAction();
      } else {
        setOutcome('failed');
        toast.error(`Couldn't update ${shown.name}`, {
          description: 'See what happened in the window',
        });
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    // Not closed while it's updating, so its outcome isn't missed
    <AlertDialog
      open={open}
      onOpenChange={(o) => !running && onOpenChangeAction(o)}
    >
      <AlertDialogContent className='data-[size=default]:sm:max-w-xl'>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {outcome === 'done'
              ? `Updated ${shown.name}`
              : outcome === 'failed'
                ? `Couldn't update ${shown.name}`
                : `Update ${shown.name}?`}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {updateDescription(update, shown.name)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {update.kind === 'version' && update.major && (
          <p className='text-xs/relaxed text-warning'>
            A new major version, which can change how it works or need its data
            migrated: check what's new first.
          </p>
        )}
        {notes && (
          <a
            href={notes}
            target='_blank'
            rel='noreferrer'
            className='inline-flex w-fit items-center gap-1.5 text-xs/relaxed font-medium underline-offset-4 hover:underline'
          >
            <ExternalLinkIcon className='size-3.5' />
            What's new
          </a>
        )}
        {output && <RunOutput lines={output} />}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={running}>
            {outcome ? 'Close' : 'Cancel'}
          </AlertDialogCancel>
          {outcome !== 'done' && (
            <Button disabled={running} onClick={() => void start()}>
              {running
                ? 'Updating…'
                : outcome === 'failed'
                  ? 'Try again'
                  : 'Update'}
            </Button>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
