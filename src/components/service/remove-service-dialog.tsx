'use client';

import { useState } from 'react';
import { toast } from 'sonner';

import { readRunStream } from '@/lib/docker/read-run-stream';
import type { Service } from '@/lib/types';

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
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

/**
 * Asks before removing a service's whole stack, and whether its folder and
 * data go too, which is left off; then shows what the server does as it goes.
 * On success it's gone from the dashboard; on failure what happened stays.
 */
export function RemoveServiceDialog({
  service,
  open,
  onOpenChangeAction,
  onRemovedAction,
}: {
  service: Service;
  open: boolean;
  onOpenChangeAction: (open: boolean) => void;
  onRemovedAction: () => void;
}) {
  const [files, setFiles] = useState(false);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<string[]>();
  const project = service.stack?.project ?? service.containerName;
  const folder = service.stack?.dir.replace(/^\/home\/[^/]+/, '~');

  async function remove() {
    setOutput([]);
    setRunning(true);
    try {
      const res = await fetch(
        `/api/containers/${service.containerId}/remove${files ? '?files=1' : ''}`,
        { method: 'POST' }
      );
      const exitCode = await readRunStream(res, (line) =>
        setOutput((lines) => [...(lines ?? []), line])
      );
      if (exitCode === 0) {
        toast.success(`Removed ${project}`);
        onRemovedAction();
      } else {
        toast.error(`Couldn't remove ${project}`, {
          description: 'See what happened in the window',
        });
      }
    } finally {
      setRunning(false);
    }
  }

  return (
    // Not closed while it's removing, so its outcome isn't missed
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (running) return;
        if (!o) {
          setOutput(undefined);
          setFiles(false);
        }
        onOpenChangeAction(o);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Remove {project}?</AlertDialogTitle>
          <AlertDialogDescription>
            Every container in its stack is stopped and removed, and its site in
            Caddy if it has one.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className='flex items-start gap-2'>
          <Checkbox
            id='remove-files'
            checked={files}
            onCheckedChange={(c) => setFiles(c === true)}
            disabled={running}
            className='mt-0.5'
          />
          <Label htmlFor='remove-files' className='leading-relaxed'>
            Also delete {folder} and its volumes, with everything it keeps
          </Label>
        </div>
        {output && <RunOutput lines={output} />}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={running}>Cancel</AlertDialogCancel>
          <Button
            variant='destructive'
            disabled={running}
            onClick={() => void remove()}
          >
            {running ? 'Removing…' : files ? 'Remove and delete' : 'Remove'}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
