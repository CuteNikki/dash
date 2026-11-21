'use client';

import { cn } from 'cn';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { removeOneContainer } from '@/actions/containers';

import { isRunning } from '@/lib/dashboard/status';
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
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

/** What Remove takes: the one container, or everything in its stack. */
type Scope = 'container' | 'stack';

/**
 * Asks before removing a service's whole stack, and whether its folder and
 * data go too, which is left off; then shows what the server does as it goes.
 * A stopped container sharing its stack with others, as a one-off that ran
 * migrations, can be removed alone, which is what's picked for it, as taking
 * the rest of its stack and its site down with it isn't what's meant. On
 * success it's gone from the dashboard; on failure what happened stays.
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
  const t = useTranslations('service');
  const others = (service.stackContainers ?? []).filter(
    (name) => name !== service.containerName
  );
  const canRemoveOne = others.length > 0 && !isRunning(service.state);
  const [picked, setPicked] = useState<Scope>('container');
  const scope: Scope = canRemoveOne ? picked : 'stack';
  const [files, setFiles] = useState(false);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<string[]>();
  const project = service.stack?.project ?? service.containerName;
  const folder = service.stack?.dir.replace(/^\/home\/[^/]+/, '~');
  const stackNames = [service.containerName, ...others].join(', ');

  async function removeOne() {
    setRunning(true);
    try {
      const result = await removeOneContainer(service.containerId);
      if (result.ok) {
        toast.success(t('removed', { name: service.containerName }));
        onRemovedAction();
      } else {
        toast.error(t('removeFailed', { name: service.containerName }), {
          description: result.error,
        });
      }
    } finally {
      setRunning(false);
    }
  }

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
        toast.success(t('removed', { name: project }));
        onRemovedAction();
      } else {
        toast.error(t('removeFailed', { name: project }), {
          description: t('seeWindow'),
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
          setPicked('container');
        }
        onOpenChangeAction(o);
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t('removeTitle', {
              name: scope === 'container' ? service.containerName : project,
            })}
          </AlertDialogTitle>
          {/* Both in one cell, so picking the other doesn't move what follows */}
          <AlertDialogDescription className='grid'>
            <span
              aria-hidden={scope !== 'container'}
              className={cn(
                'col-start-1 row-start-1',
                scope !== 'container' && 'invisible'
              )}
            >
              {t('removeOne', { project })}
            </span>
            <span
              aria-hidden={scope !== 'stack'}
              className={cn(
                'col-start-1 row-start-1',
                scope !== 'stack' && 'invisible'
              )}
            >
              {t('removeStack', { names: stackNames })}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        {canRemoveOne && (
          <ToggleGroup
            type='single'
            variant='segmented'
            value={scope}
            // Picking the shown one again would unpick it; keep one picked
            onValueChange={(v) => v && setPicked(v as Scope)}
            disabled={running}
            aria-label={t('whatToRemove')}
          >
            <ToggleGroupItem value='container'>
              {t('thisContainer')}
            </ToggleGroupItem>
            <ToggleGroupItem value='stack'>{t('wholeStack')}</ToggleGroupItem>
          </ToggleGroup>
        )}
        <div className='flex items-start gap-2'>
          <Checkbox
            id='remove-files'
            checked={scope === 'stack' && files}
            onCheckedChange={(c) => setFiles(c === true)}
            disabled={running || scope !== 'stack'}
            className='mt-0.5'
          />
          <Label htmlFor='remove-files' className='leading-relaxed'>
            {t('alsoDelete', { folder: folder ?? '' })}
          </Label>
        </div>
        {output && <RunOutput lines={output} />}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={running}>
            {t('cancel')}
          </AlertDialogCancel>
          <Button
            variant='destructive'
            disabled={running}
            onClick={() =>
              void (scope === 'container' ? removeOne() : remove())
            }
          >
            {running
              ? t('removing')
              : scope === 'stack' && files
                ? t('removeAndDelete')
                : t('remove')}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
