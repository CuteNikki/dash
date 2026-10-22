'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { PowerIcon, RefreshCwIcon } from 'lucide-react';

import { checkSystemUpdates } from '@/actions/system';
import { readRunStream } from '@/lib/docker/read-run-stream';
import { formatAgo } from '@/lib/format';
import type { SystemUpdates } from '@/lib/types';

import { RunOutput } from '@/components/common/run-output';
import { ScrollFade } from '@/components/common/scroll-fade';
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** Packages whose upgrade restarts Docker, and every container with it. */
const RESTARTS_DOCKER =
  /^(docker-ce|docker-ce-cli|containerd\.io|containerd|runc)$/;

/** How long to keep trying to follow an upgrade again, while dash is gone with Docker. */
const RECONNECT_MS = 5 * 60_000;
const RETRY_MS = 3_000;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * The server's own updates, Ubuntu's packages: what's waiting, security
 * fixes first; installing them, following what apt prints, through Docker
 * restarting partway when it's among them; and restarting the server.
 */
export function SystemDialog({
  open,
  system,
  onClose,
  onChanged,
}: {
  open: boolean;
  system?: SystemUpdates;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [output, setOutput] = useState<string[]>();
  const [running, setRunning] = useState(false);
  const [confirmReboot, setConfirmReboot] = useState(false);
  const [checking, startCheck] = useTransition();
  const say = (line: string) => setOutput((lines) => [...(lines ?? []), line]);

  /**
   * Follows the upgrade until it says how it ended, following it again from
   * its start whenever the connection breaks, until dash is back.
   */
  async function follow(first: () => Promise<Response>) {
    setRunning(true);
    setOutput([]);
    let request = first;
    const giveUp = Date.now() + RECONNECT_MS;
    try {
      for (;;) {
        const res = await request().catch(() => undefined);
        const exit = res ? await readRunStream(res, say) : undefined;
        if (exit !== undefined) {
          if (exit === 0) toast.success('The server’s packages are up to date');
          else
            toast.error('The upgrade didn’t finish', {
              description: 'See what apt said in the window',
            });
          return;
        }
        if (Date.now() > giveUp) {
          say(
            '— Still no answer from dash. The upgrade carries on on the server; open this again to follow it.'
          );
          return;
        }
        say(
          '— Lost the connection, as Docker restarting does. The upgrade carries on; following it again once dash is back…'
        );
        await wait(RETRY_MS);
        // From its start again, so what's shown is the whole of it
        setOutput([]);
        request = () => fetch('/api/system/upgrade');
      }
    } finally {
      setRunning(false);
      onChanged();
    }
  }

  // An upgrade already running, as one started before a reload, is followed
  // as soon as the window opens
  const followed = useRef(false);
  useEffect(() => {
    if (!open) {
      followed.current = false;
      return;
    }
    if (system?.upgrading && !running && !followed.current) {
      followed.current = true;
      void follow(() => fetch('/api/system/upgrade'));
    }
    // Only as it opens, or learns one is running
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, system?.upgrading]);

  function checkNow() {
    startCheck(async () => {
      const result = await checkSystemUpdates();
      if (result.error) {
        toast.error('Couldn’t look at the server’s updates', {
          description: result.error,
        });
      }
      onChanged();
    });
  }

  async function reboot() {
    const res = await fetch('/api/system/reboot', { method: 'POST' });
    if (res.ok) {
      toast.success('Restarting the server', {
        description: 'dash is back in a minute or two',
      });
      onClose();
    } else {
      toast.error('Couldn’t restart the server', {
        description: (await res.json().catch(() => null))?.error,
      });
    }
  }

  const packages = system?.packages ?? [];
  const docker = packages.filter((p) => RESTARTS_DOCKER.test(p.name));

  return (
    // Not closed while it's upgrading, so its outcome isn't missed
    <Dialog open={open} onOpenChange={(o) => !o && !running && onClose()}>
      <DialogContent className='flex flex-col sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>System updates</DialogTitle>
          <DialogDescription>
            {!system
              ? 'Looking at the server…'
              : [
                  system.os,
                  system.refreshedAt &&
                    `package lists fetched ${formatAgo(system.refreshedAt)}`,
                ]
                  .filter(Boolean)
                  .join(', ')}
          </DialogDescription>
        </DialogHeader>

        {system?.reboot && (
          <p className='rounded-lg bg-warning/10 p-3 text-warning'>
            Ubuntu asks for a restart to finish what’s been installed
            {system.rebootFor.length ? ` (${system.rebootFor.join(', ')})` : ''}
            .
          </p>
        )}
        {system && system.failedUnits.length > 0 && (
          <p className='text-muted-foreground'>
            Failed on the server: {system.failedUnits.join(', ')}
          </p>
        )}
        {system?.lastExit !== undefined &&
          system.lastExit !== 0 &&
          !running && (
            <p className='text-destructive'>
              The last upgrade from dash didn’t finish (apt exited with{' '}
              {system.lastExit}).
            </p>
          )}

        {system &&
          (packages.length ? (
            <div className='overflow-hidden rounded-lg border'>
              <ScrollFade
                fadeFrom='from-popover'
                className='max-h-64 overflow-auto'
              >
                {/* As wide as its longest line, scrolling sideways to it,
                    rather than cutting versions short */}
                <ul className='w-max min-w-full divide-y'>
                  {packages.map((p) => (
                    <li
                      key={p.name}
                      // The name, then its versions under it, whole: the
                      // list scrolls sideways only to the longest version
                      className='flex flex-col px-3 py-1.5'
                    >
                      <span className='font-medium whitespace-nowrap'>
                        {p.name}
                        {p.security && (
                          <span className='ml-2 font-sans text-warning'>
                            security
                          </span>
                        )}
                      </span>
                      <span
                        className='font-mono whitespace-nowrap text-muted-foreground'
                        title={`${p.from} → ${p.to}`}
                      >
                        {p.from} → {p.to}
                      </span>
                    </li>
                  ))}
                </ul>
              </ScrollFade>
            </div>
          ) : (
            <p className='text-muted-foreground'>
              Every package is up to date.
            </p>
          ))}

        {docker.length > 0 && !output && (
          <p className='text-muted-foreground'>
            {docker.map((p) => p.name).join(', ')} among them: Docker restarts,
            and every container with it, dash too, for a moment. The upgrade
            carries on, and this window follows it again once dash is back.
          </p>
        )}

        {output && <RunOutput lines={output} placeholder='Starting apt…' />}

        <DialogFooter>
          <Button
            variant='outline'
            disabled={running || checking}
            onClick={checkNow}
            className='sm:mr-auto'
          >
            <RefreshCwIcon className={checking ? 'animate-spin' : ''} />
            Check now
          </Button>
          <Button
            variant={system?.reboot ? 'warning' : 'outline'}
            disabled={running}
            onClick={() => setConfirmReboot(true)}
          >
            <PowerIcon />
            Restart server
          </Button>
          {packages.length > 0 && (
            <Button
              disabled={running || !system || system.upgrading}
              onClick={() =>
                void follow(() =>
                  fetch('/api/system/upgrade', { method: 'POST' })
                )
              }
            >
              {running
                ? 'Upgrading…'
                : `Upgrade ${packages.length} package${packages.length === 1 ? '' : 's'}`}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={confirmReboot} onOpenChange={setConfirmReboot}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restart the server?</AlertDialogTitle>
            <AlertDialogDescription>
              Everything on it goes down for a minute or two, dash too, and
              comes back by itself as the server starts again.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => void reboot()}
            >
              Restart
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
