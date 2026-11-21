'use client';

import { useTranslations } from 'next-intl';
import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  useTransition,
} from 'react';
import { toast } from 'sonner';

import { PowerIcon, RefreshCwIcon } from 'lucide-react';

import { checkSystemUpdates } from '@/actions/system';

import { useFormat } from '@/i18n/use-format';

import { readRunStream } from '@/lib/docker/read-run-stream';
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

/** How long to keep trying to follow an upgrade again, while the dashboard is gone with Docker. */
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
  onCloseAction,
  onChangedAction,
}: {
  open: boolean;
  system?: SystemUpdates;
  onCloseAction: () => void;
  onChangedAction: () => void;
}) {
  const format = useFormat();
  const t = useTranslations('system');
  const [output, setOutput] = useState<string[]>();
  const [running, setRunning] = useState(false);
  const [confirmReboot, setConfirmReboot] = useState(false);
  const [checking, startCheck] = useTransition();
  const say = (line: string) => setOutput((lines) => [...(lines ?? []), line]);

  /**
   * Follows the upgrade until it says how it ended, following it again from
   * its start whenever the connection breaks, until the dashboard is back.
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
          if (exit === 0) toast.success(t('upToDateToast'));
          else
            toast.error(t('upgradeFailed'), {
              description: t('seeApt'),
            });
          return;
        }
        if (Date.now() > giveUp) {
          say(t('noAnswer'));
          return;
        }
        say(t('lostConnection'));
        await wait(RETRY_MS);
        // From its start again, so what's shown is the whole of it
        setOutput([]);
        request = () => fetch('/api/system/upgrade');
      }
    } finally {
      setRunning(false);
      onChangedAction();
    }
  }

  // An upgrade already running, as one started before a reload, is followed
  // as soon as the window opens
  const followed = useRef(false);
  // Reads whether it's already following as it is then, without that being
  // a reason to look again
  const followRunning = useEffectEvent(() => {
    if (running || followed.current) return;
    followed.current = true;
    void follow(() => fetch('/api/system/upgrade'));
  });
  // Only as it opens, or learns one is running
  const upgrading = system?.upgrading;
  useEffect(() => {
    if (!open) {
      followed.current = false;
      return;
    }
    if (upgrading) followRunning();
  }, [open, upgrading]);

  function checkNow() {
    startCheck(async () => {
      const result = await checkSystemUpdates();
      if (result.error) {
        toast.error(t('lookFailed'), {
          description: result.error,
        });
      }
      onChangedAction();
    });
  }

  async function reboot() {
    const res = await fetch('/api/system/reboot', { method: 'POST' });
    if (res.ok) {
      toast.success(t('restarting'), {
        description: t('backSoon'),
      });
      onCloseAction();
    } else {
      toast.error(t('restartFailed'), {
        description: (await res.json().catch(() => null))?.error,
      });
    }
  }

  // What an upgrade installs, apart from what apt holds back
  const packages = (system?.packages ?? []).filter(
    (p) => !p.phased && !p.keptBack
  );
  const phased = (system?.packages ?? []).filter((p) => p.phased);
  const keptBack = (system?.packages ?? []).filter((p) => p.keptBack);
  const docker = packages.filter((p) => RESTARTS_DOCKER.test(p.name));

  return (
    // Not closed while it's upgrading, so its outcome isn't missed
    <Dialog open={open} onOpenChange={(o) => !o && !running && onCloseAction()}>
      <DialogContent className='flex flex-col sm:max-w-2xl'>
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>
            {!system
              ? t('looking')
              : [
                  system.os,
                  system.refreshedAt &&
                    t('fetched', { ago: format.ago(system.refreshedAt) }),
                ]
                  .filter(Boolean)
                  .join(', ')}
          </DialogDescription>
        </DialogHeader>

        {system?.reboot && (
          <p className='rounded-lg bg-warning/10 p-3 text-warning'>
            {system.rebootFor.length
              ? t('rebootFor', { packages: system.rebootFor.join(', ') })
              : t('reboot')}
          </p>
        )}
        {system && system.failedUnits.length > 0 && (
          <p className='text-warning'>
            {t('failedUnits', {
              count: system.failedUnits.length,
              units: system.failedUnits
                .map((u) =>
                  u.description ? `${u.name} (${u.description})` : u.name
                )
                .join(', '),
            })}
          </p>
        )}
        {system?.lastExit !== undefined &&
          system.lastExit !== 0 &&
          !running && (
            <p className='text-destructive'>
              {t('lastFailed', { code: system.lastExit })}
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
                            {t('security')}
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
            <p className='text-muted-foreground'>{t('allUpToDate')}</p>
          ))}

        {phased.length > 0 && (
          // What they are, then why they're waiting on a line of its own,
          // so it isn't lost at the end of a long list
          <div className='flex flex-col gap-1 text-muted-foreground'>
            <p>
              {t('phased', { packages: phased.map((p) => p.name).join(', ') })}
            </p>
            <p>{t('phasedWhy')}</p>
          </div>
        )}
        {keptBack.length > 0 && (
          <div className='flex flex-col gap-1 text-muted-foreground'>
            <p>
              {t('keptBack', {
                packages: keptBack.map((p) => p.name).join(', '),
              })}
            </p>
            <p>{t('keptBackWhy')}</p>
          </div>
        )}

        {docker.length > 0 && !output && (
          <p className='text-muted-foreground'>
            {t('dockerRestarts', {
              packages: docker.map((p) => p.name).join(', '),
            })}
          </p>
        )}

        {output && <RunOutput lines={output} placeholder={t('startingApt')} />}

        <DialogFooter>
          <Button
            variant='outline'
            disabled={running || checking}
            onClick={checkNow}
            className='sm:mr-auto'
          >
            <RefreshCwIcon className={checking ? 'animate-spin' : ''} />
            {t('checkNow')}
          </Button>
          <Button
            // It takes everything on the server down, the dashboard too
            variant='destructive'
            disabled={running}
            onClick={() => setConfirmReboot(true)}
          >
            <PowerIcon />
            {t('restartServer')}
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
                ? t('upgrading')
                : t('upgrade', { count: packages.length })}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>

      <AlertDialog open={confirmReboot} onOpenChange={setConfirmReboot}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('restartTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('restartDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => void reboot()}
            >
              {t('restart')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
}
