'use client';

import type { Passkey } from '@better-auth/passkey/client';
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

const nameOf = (passkey: Passkey) => passkey.name || 'Passkey';

/** The day it was added, "3 Nov 2026"; it comes over the wire as text. */
const addedOn = (passkey: Passkey) =>
  passkey.createdAt
    ? new Date(passkey.createdAt).toLocaleDateString(undefined, {
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
      attempt("Couldn't add the passkey", async () => {
        // Named after where it was made, until it's renamed
        const result = await authClient.passkey.addPasskey({
          name: describeAgent(navigator.userAgent),
        });
        const error: { code?: string; message?: string } | null = result?.error;
        if (error) {
          // Closing the browser's own window is no failure to tell of
          if (error.code !== 'ERROR_CEREMONY_ABORTED') setAddError(error);
          return;
        }
        toast.success('Passkey added. You can sign in with it next time.');
      })
    );
  }

  function remove(passkey: Passkey) {
    void attempt(`Couldn't remove ${nameOf(passkey)}`, async () => {
      const { error } = await authClient.passkey.deletePasskey({
        id: passkey.id,
      });
      if (error) {
        toast.error(`Couldn't remove ${nameOf(passkey)}`, {
          description: error.message,
        });
      } else {
        toast.success(`Removed ${nameOf(passkey)}`);
      }
    });
  }

  return (
    <div className='flex flex-col gap-3'>
      <p>
        A passkey signs you in with your fingerprint, face or your device's PIN,
        with no password to type.
      </p>
      {isPending && !passkeys ? (
        rows ? (
          <ul className='flex flex-col gap-1'>
            {Array.from({ length: rows }, (_, i) => (
              <li key={i} className='flex min-h-7 items-center gap-3'>
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
              </li>
            ))}
          </ul>
        ) : (
          <p className='text-muted-foreground'>None yet.</p>
        )
      ) : error && !passkeys ? (
        <p className='text-destructive'>
          Couldn't list them: {error.message || error.statusText}
        </p>
      ) : passkeys && passkeys.length > 0 ? (
        <ul className='flex flex-col gap-1'>
          {passkeys.map((passkey) => (
            <PasskeyRow
              key={passkey.id}
              passkey={passkey}
              onRemoveAction={() => setRemoving(passkey)}
            />
          ))}
        </ul>
      ) : (
        <p className='text-muted-foreground'>None yet.</p>
      )}
      {isStale(addError) ? (
        <SignInAgain />
      ) : (
        addError && (
          <p className='text-destructive'>
            {addError.message ?? "Couldn't add the passkey"}
          </p>
        )
      )}
      <Button
        variant='outline'
        disabled={adding}
        onClick={add}
        className='self-start'
      >
        <PlusIcon />
        Add a passkey
      </Button>

      <AlertDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(undefined)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Remove {removing && nameOf(removing)}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              It won't sign you in to the dashboard any more. Your device or
              password manager keeps it until you delete it there too.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant='destructive'
              onClick={() => removing && remove(removing)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
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
      attempt(`Couldn't rename ${nameOf(passkey)}`, async () => {
        const { error } = await authClient.passkey.updatePasskey({
          id: passkey.id,
          name: newName,
        });
        if (error) {
          toast.error(`Couldn't rename ${nameOf(passkey)}`, {
            description: error.message,
          });
          return;
        }
        setEditing(false);
      })
    );
  }

  const added = addedOn(passkey);
  return (
    <li className='flex min-h-7 items-center gap-3'>
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
            aria-label='Name'
            placeholder='Passkey'
            autoFocus
            required
            className='h-7 min-w-0 flex-1'
          />
          <Button
            type='submit'
            variant='outline'
            size='icon'
            disabled={pending}
            aria-label='Save the name'
            title='Save the name'
          >
            <CheckIcon />
          </Button>
          <Button
            type='button'
            variant='outline'
            size='icon'
            aria-label='Cancel'
            title='Cancel'
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
              {nameOf(passkey)}
            </span>
            {added && (
              <span className='shrink-0 whitespace-nowrap text-muted-foreground'>
                Added {added}
              </span>
            )}
          </div>
          {/* Together, as one passkey's, apart from the next row's */}
          <span className='flex shrink-0 items-center gap-1'>
            <Button
              variant='outline'
              size='icon'
              aria-label={`Rename ${nameOf(passkey)}`}
              title='Rename'
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
              aria-label={`Remove ${nameOf(passkey)}`}
              title='Remove'
              onClick={onRemoveAction}
            >
              <Trash2Icon />
            </Button>
          </span>
        </>
      )}
    </li>
  );
}
