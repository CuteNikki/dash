'use client';

import type { Passkey } from '@better-auth/passkey/client';
import { useLocale, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import {
  CheckIcon,
  KeyRoundIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react';

import { authClient } from '@/lib/auth/auth-client';

import { TextSkeleton } from '@/components/common/skeletons';
import { attempt } from '@/components/common/toasts';
import { useKeptCount } from '@/components/common/use-kept';
import {
  SettingsFooter,
  SettingsItem,
  SettingsSection,
} from '@/components/settings/section';
import { isStale, SignInAgain } from '@/components/settings/sign-in-again';
import { describeAgent } from '@/components/settings/user-agent';
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
import { Input } from '@/components/ui/input';

/** Its name, or the word for one it hasn't been given. */
const nameOf = (passkey: Passkey, fallback: string) => passkey.name || fallback;

/** The day it was added, "3 Nov 2026"; it comes over the wire as text. */
const addedOn = (passkey: Passkey, locale: string) =>
  passkey.createdAt
    ? new Date(passkey.createdAt).toLocaleDateString(locale, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : undefined;

/**
 * The passkeys that sign this account in, each to rename or remove, and the
 * way to add another. The list follows Better Auth's own, which it reads
 * again after each of these.
 */
export function PasskeyList() {
  const tSecurity = useTranslations('security');
  const tAgent = useTranslations('agent');
  const t = useTranslations('passkeys');
  const { data: passkeys, error, isPending } = authClient.useListPasskeys();
  const [adding, startAdding] = useTransition();
  const [addError, setAddError] = useState<{
    code?: string;
    message?: string;
  }>();
  const [removing, setRemoving] = useState<Passkey>();
  // While they're listed, as many rows as last time
  const rows = useKeptCount('passkeys', passkeys?.length, 1);

  function add() {
    setAddError(undefined);
    startAdding(() =>
      attempt(t('addFailed'), async () => {
        // Named after where it was made, until it's renamed
        const result = await authClient.passkey.addPasskey({
          name: describeAgent(navigator.userAgent, tAgent),
        });
        const error: { code?: string; message?: string } | null = result?.error;
        if (error) {
          // Closing the browser's own window is no failure to tell of
          if (error.code !== 'ERROR_CEREMONY_ABORTED') setAddError(error);
          return;
        }
        toast.success(t('added'));
      })
    );
  }

  function remove(passkey: Passkey) {
    void attempt(
      t('removeFailed', { name: nameOf(passkey, t('passkey')) }),
      async () => {
        const { error } = await authClient.passkey.deletePasskey({
          id: passkey.id,
        });
        if (error) {
          toast.error(
            t('removeFailed', { name: nameOf(passkey, t('passkey')) }),
            {
              description: error.message,
            }
          );
        } else {
          toast.success(t('removed', { name: nameOf(passkey, t('passkey')) }));
        }
      }
    );
  }

  return (
    <SettingsSection title={tSecurity('passkeys')} description={t('intro')}>
      {isPending && !passkeys ? (
        rows ? (
          <>
            {Array.from({ length: rows }, (_, i) => (
              <SettingsItem key={i}>
                <KeyRoundIcon className='size-3.5 shrink-0 text-muted-foreground' />
                {/* Its name and when it was added, under it on a phone */}
                <span className='flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-3'>
                  <span className='sm:flex-1'>
                    <TextSkeleton className='w-32' />
                  </span>
                  <TextSkeleton className='w-32' />
                </span>
                {/* Its two buttons' room */}
                <span className='h-7 w-15 shrink-0' />
              </SettingsItem>
            ))}
          </>
        ) : (
          <SettingsItem>
            <p className='text-muted-foreground'>{t('noneYet')}</p>
          </SettingsItem>
        )
      ) : error && !passkeys ? (
        <SettingsItem>
          <p className='text-destructive'>
            {t('listFailed', { error: error.message || error.statusText })}
          </p>
        </SettingsItem>
      ) : passkeys && passkeys.length > 0 ? (
        passkeys.map((passkey) => (
          <PasskeyRow
            key={passkey.id}
            passkey={passkey}
            onRemoveAction={() => setRemoving(passkey)}
          />
        ))
      ) : (
        <SettingsItem>
          <p className='text-muted-foreground'>{t('noneYet')}</p>
        </SettingsItem>
      )}
      <SettingsFooter>
        {isStale(addError) ? (
          <div className='mr-auto'>
            <SignInAgain />
          </div>
        ) : (
          addError && (
            <p className='mr-auto text-destructive'>
              {addError.message ?? t('addFailed')}
            </p>
          )
        )}
        <Button variant='outline' disabled={adding} onClick={add}>
          <PlusIcon />
          {t('add')}
        </Button>
      </SettingsFooter>

      <AlertDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t('removeTitle', {
                name: removing ? nameOf(removing, t('passkey')) : '',
              })}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t('removeDescription')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => removing && remove(removing)}
            >
              {t('remove')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  );
}

/** One passkey: its name, renamed in place, the day it was added, and its buttons. */
function PasskeyRow({
  passkey,
  onRemoveAction,
}: {
  passkey: Passkey;
  onRemoveAction: () => void;
}) {
  const locale = useLocale();
  const t = useTranslations('passkeys');
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(passkey.name ?? '');
  const [pending, startTransition] = useTransition();

  function rename() {
    const newName = name.trim();
    if (!newName || newName === passkey.name) {
      setEditing(false);
      return;
    }
    startTransition(() =>
      attempt(
        t('renameFailed', { name: nameOf(passkey, t('passkey')) }),
        async () => {
          const { error } = await authClient.passkey.updatePasskey({
            id: passkey.id,
            name: newName,
          });
          if (error) {
            toast.error(
              t('renameFailed', { name: nameOf(passkey, t('passkey')) }),
              {
                description: error.message,
              }
            );
            return;
          }
          setEditing(false);
        }
      )
    );
  }

  const added = addedOn(passkey, locale);
  return (
    <SettingsItem>
      <KeyRoundIcon className='size-3.5 shrink-0 text-muted-foreground' />
      {editing ? (
        <form
          className='flex min-w-0 flex-1 items-center gap-1'
          onSubmit={(e) => {
            e.preventDefault();
            rename();
          }}
        >
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            // Leaves the name as it was; the window stays open, as it
            // looks for this mark
            data-escape-cancels
            onKeyDown={(e) => e.key === 'Escape' && setEditing(false)}
            aria-label={t('name')}
            placeholder={t('passkey')}
            autoFocus
            required
            className='h-7 min-w-0 flex-1'
          />
          <Button
            type='submit'
            variant='outline'
            size='icon'
            disabled={pending}
            aria-label={t('saveName')}
            title={t('saveName')}
          >
            <CheckIcon />
          </Button>
          <Button
            type='button'
            variant='outline'
            size='icon'
            aria-label={t('cancel')}
            title={t('cancel')}
            onClick={() => setEditing(false)}
          >
            <XIcon />
          </Button>
        </form>
      ) : (
        <>
          {/* Its name, then when it was added, beside it, or under it on a
              phone so the name has the width */}
          <div className='flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-3'>
            <span className='min-w-0 truncate font-medium sm:flex-1'>
              {nameOf(passkey, t('passkey'))}
            </span>
            {added && (
              <span className='shrink-0 whitespace-nowrap text-muted-foreground'>
                {t('addedOn', { date: added })}
              </span>
            )}
          </div>
          {/* Together, as one passkey's, apart from the next row's */}
          <span className='flex shrink-0 items-center gap-1'>
            <Button
              variant='outline'
              size='icon'
              aria-label={t('rename', { name: nameOf(passkey, t('passkey')) })}
              title={t('renameShort')}
              onClick={() => {
                setName(passkey.name ?? '');
                setEditing(true);
              }}
            >
              <PencilIcon />
            </Button>
            <Button
              variant='destructive'
              size='icon'
              aria-label={t('removeName', {
                name: nameOf(passkey, t('passkey')),
              })}
              title={t('remove')}
              onClick={onRemoveAction}
            >
              <Trash2Icon />
            </Button>
          </span>
        </>
      )}
    </SettingsItem>
  );
}
