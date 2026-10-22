'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { ExternalLinkIcon } from 'lucide-react';

import { readRunStream } from '@/lib/docker/read-run-stream';
import type { Service } from '@/lib/types';
import { releasesUrl, updateDescription } from '@/lib/updates/describe';

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

/**
 * Asks before updating a service, saying what it'll do, with a link to
 * what's new for a new version; then shows what the server does as it goes.
 */
export function UpdateDialog({
  service,
  open,
  onOpenChange,
  onUpdated,
}: {
  service: Service;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}) {
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<string[]>();
  const update = service.update;
  if (!update) return null;
  const notes = update.kind === 'version' && releasesUrl(update.source);

  async function start() {
    setOutput([]);
    setRunning(true);
    try {
      const exitCode = await runUpdate(service, (line) =>
        setOutput((lines) => [...(lines ?? []), line])
      );
      if (exitCode === 0) {
        toast.success(`Updated ${service.name}`);
        onUpdated();
      } else {
        toast.error(`Couldn't update ${service.name}`, {
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
      onOpenChange={(o) => {
        if (running) return;
        if (!o) setOutput(undefined);
        onOpenChange(o);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Update {service.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            {updateDescription(update, service.name)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {update.kind === 'version' && update.major && (
          <p className='text-warning'>
            A new major version, which can change how it works or need its data
            migrated: check what’s new first.
          </p>
        )}
        {notes && (
          <a
            href={notes}
            target='_blank'
            rel='noreferrer'
            className='inline-flex w-fit items-center gap-1.5 underline-offset-4 hover:underline'
          >
            <ExternalLinkIcon className='size-3.5' />
            What’s new
          </a>
        )}
        {output && (
          <pre
            aria-live='polite'
            className='max-h-40 overflow-auto rounded-lg bg-muted p-3 font-mono text-xs/relaxed whitespace-pre-wrap text-muted-foreground'
          >
            {output.length ? output.join('\n') : 'Starting…'}
          </pre>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={running}>Cancel</AlertDialogCancel>
          <Button disabled={running} onClick={() => void start()}>
            {running ? 'Updating…' : 'Update'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
