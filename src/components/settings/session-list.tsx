'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';

import { LogOutIcon, MonitorIcon, SmartphoneIcon } from 'lucide-react';

import { authClient } from '@/lib/auth/auth-client';

import { TextSkeleton } from '@/components/common/skeletons';
import { attempt } from '@/components/common/toasts';
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
function formatDay(at: Date | string) {
  const date = new Date(at);
  const days = Math.round(
    (new Date().setHours(0, 0, 0, 0) - new Date(date).setHours(0, 0, 0, 0)) /
      86_400_000
  );
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return date.toLocaleDateString(undefined, {
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

  function signOut(session: Session) {
    const name = describeAgent(session.userAgent);
    startTransition(() =>
      attempt(`Couldn't sign out ${name}`, async () => {
        const { error } = await authClient.revokeSession({
          token: session.token,
        });
        if (error) {
          toast.error(`Couldn't sign out ${name}`, {
            description: error.message,
          });
        } else {
          toast.success(`Signed out ${name}`);
        }
        await mutate();
      })
    );
  }

  function signOutOthers() {
    startTransition(() =>
      attempt("Couldn't sign out your other devices", async () => {
        const { error } = await authClient.revokeOtherSessions();
        if (error) {
          toast.error("Couldn't sign out your other devices", {
            description: error.message,
          });
        } else {
          toast.success('Signed out your other devices');
        }
        await mutate();
      })
    );
  }

  if (isStale(error)) return <SignInAgain />;
  if (isLoading) return <TextSkeleton className='w-48' />;
  if (error) {
    return (
      <p className='text-destructive'>
        Couldn't list them: {error.message ?? "dash didn't answer"}
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
                    {describeAgent(session.userAgent)}
                  </span>
                  {here && <Badge variant='secondary'>This device</Badge>}
                </span>
                <span className='w-32 shrink-0 truncate font-mono text-muted-foreground tabular-nums'>
                  {session.ipAddress || 'No address'}
                </span>
                <span className='w-36 shrink-0 text-muted-foreground'>
                  Signed in {formatDay(session.createdAt)}
                </span>
                {/* Renewed at most once a day, so it's to within a day */}
                <span className='w-36 shrink-0 text-muted-foreground'>
                  Last used {formatDay(session.updatedAt)}
                </span>
              </span>
              {/* Its room kept on this one, so the others' buttons line up */}
              <span className='flex size-5 shrink-0'>
                {!here && (
                  <Button
                    variant='ghost'
                    size='icon-xs'
                    disabled={pending}
                    aria-label={`Sign out ${describeAgent(session.userAgent)}`}
                    title='Sign out'
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
          variant='outline'
          disabled={pending}
          onClick={() => setConfirmAll(true)}
          className='self-start'
        >
          <LogOutIcon />
          Sign out all other devices
        </Button>
      )}

      <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out all other devices?</AlertDialogTitle>
            <AlertDialogDescription>
              Each of them needs your password or a passkey to get back in. This
              one stays signed in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction variant='destructive' onClick={signOutOthers}>
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
