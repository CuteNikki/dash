'use client';

import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';

import { LogOutIcon, MonitorIcon, SmartphoneIcon } from 'lucide-react';

import { authClient } from '@/lib/auth/auth-client';

import { TextSkeleton } from '@/components/common/skeletons';
import { attempt } from '@/components/common/toasts';
import { useKeptCount } from '@/components/common/use-kept';
import { isStale, SignInAgain } from '@/components/settings/sign-in-again';
import { describeAgent, parseAgent } from '@/components/settings/user-agent';
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

type Session = {
  id: string;
  token: string;
  userAgent?: string | null;
  ipAddress?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
};

/** Better Auth's answer as SWR wants it: the list, or its error thrown with its code. */
async function listSessions(): Promise<Session[]> {
  const { data, error } = await authClient.listSessions();
  if (error) throw error;
  return data ?? [];
}

/** A day as a list reads it: "today", "yesterday", "3 Nov 2026". */
function formatDay(
  at: Date | string,
  t: ReturnType<typeof useTranslations<'sessions'>>,
  locale: string
) {
  const date = new Date(at);
  const days = Math.round(
    (new Date().setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) /
      86_400_000
  );
  if (days === 0) return t('today');
  if (days === 1) return t('yesterday');
  return date.toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Where this account is signed in: each browser, from what it says it is,
 * where from and when, this one marked; any of the others to sign out, or
 * all of them at once.
 */
export function SessionList() {
  const locale = useLocale();
  const tAgent = useTranslations('agent');
  const t = useTranslations('sessions');
  const { data: current } = authClient.useSession();
  const { data, error, isLoading, mutate } = useSWR<
    Session[],
    { code?: string; message?: string }
  >('auth/sessions', listSessions, { revalidateOnFocus: false });
  const [pending, startTransition] = useTransition();
  const [confirmAll, setConfirmAll] = useState(false);

  // This one first, then the most recently signed in
  const sessions = [...(data ?? [])].sort((a, b) =>
    a.id === current?.session.id
      ? -1
      : b.id === current?.session.id
        ? 1
        : new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  const others = sessions.filter((s) => s.id !== current?.session.id);
  // While they're listed, as many rows as last time
  const rows = useKeptCount('sessions', data?.length, 1);

  function signOut(session: Session) {
    const name = describeAgent(session.userAgent, tAgent);
    startTransition(() =>
      attempt(t('signOutFailed', { name }), async () => {
        const { error } = await authClient.revokeSession({
          token: session.token,
        });
        if (error) {
          toast.error(t('signOutFailed', { name }), {
            description: error.message,
          });
        } else {
          toast.success(t('signedOut', { name }));
        }
        await mutate();
      })
    );
  }

  function signOutOthers() {
    startTransition(() =>
      attempt(t('othersFailed'), async () => {
        const { error } = await authClient.revokeOtherSessions();
        if (error) {
          toast.error(t('othersFailed'), {
            description: error.message,
          });
        } else {
          toast.success(t('othersSignedOut'));
        }
        await mutate();
      })
    );
  }

  if (isStale(error)) return <SignInAgain />;
  if (isLoading) {
    // As many rows as last time, each with its columns, and the button to
    // sign the others out if there were others
    return (
      <div className='flex flex-col gap-3'>
        <ul className='flex flex-col gap-2'>
          {Array.from({ length: rows }, (_, i) => (
            <li key={i} className='flex items-center gap-3'>
              <MonitorIcon className='size-3.5 shrink-0 text-muted-foreground' />
              <span className='flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5'>
                <span className='w-48 min-w-0'>
                  <TextSkeleton className='w-32' />
                </span>
                <span className='w-32 shrink-0'>
                  <TextSkeleton className='w-24' />
                </span>
                <span className='w-36 shrink-0'>
                  <TextSkeleton className='w-28' />
                </span>
                <span className='w-36 shrink-0'>
                  <TextSkeleton className='w-28' />
                </span>
              </span>
              <span className='size-7 shrink-0' />
            </li>
          ))}
        </ul>
        {rows > 1 && <Skeleton className='h-7 w-44 bg-foreground/10' />}
      </div>
    );
  }
  if (error) {
    return (
      <p className='text-destructive'>
        {t('listFailed', { error: error.message ?? t('noAnswer') })}
      </p>
    );
  }

  return (
    <div className='flex flex-col gap-3'>
      <ul className='flex flex-col gap-2'>
        {sessions.map((session) => {
          const here = session.id === current?.session.id;
          const Icon = parseAgent(session.userAgent).mobile
            ? SmartphoneIcon
            : MonitorIcon;
          return (
            <li key={session.id} className='flex items-center gap-3'>
              <Icon className='size-3.5 shrink-0 text-muted-foreground' />
              <span className='flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5'>
                <span className='flex w-48 min-w-0 items-center gap-2'>
                  <span className='truncate font-medium'>
                    {describeAgent(session.userAgent, tAgent)}
                  </span>
                  {here && <Badge variant='secondary'>{t('thisDevice')}</Badge>}
                </span>
                <span className='w-32 shrink-0 truncate font-mono text-muted-foreground tabular-nums'>
                  {session.ipAddress || t('noAddress')}
                </span>
                <span className='w-36 shrink-0 text-muted-foreground'>
                  {t('signedIn', {
                    day: formatDay(session.createdAt, t, locale),
                  })}
                </span>
                {/* Renewed at most once a day, so it's to within a day */}
                <span className='w-36 shrink-0 text-muted-foreground'>
                  {t('lastUsed', {
                    day: formatDay(session.updatedAt, t, locale),
                  })}
                </span>
              </span>
              {/* Its room kept on this one, so the others' buttons line up */}
              <span className='flex size-7 shrink-0'>
                {!here && (
                  <Button
                    variant='destructive'
                    size='icon'
                    disabled={pending}
                    aria-label={t('signOutName', {
                      name: describeAgent(session.userAgent, tAgent),
                    })}
                    title={t('signOut')}
                    onClick={() => signOut(session)}
                  >
                    <LogOutIcon />
                  </Button>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {others.length > 0 && (
        <Button
          variant='destructive'
          disabled={pending}
          onClick={() => setConfirmAll(true)}
          className='self-start'
        >
          <LogOutIcon />
          {t('signOutAll')}
        </Button>
      )}

      <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('signOutAllTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('signOutAllDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction variant='destructive' onClick={signOutOthers}>
              {t('signOut')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
