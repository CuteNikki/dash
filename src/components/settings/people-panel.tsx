'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';

import {
  BanIcon,
  CircleCheckIcon,
  LogOutIcon,
  PencilIcon,
  Trash2Icon,
  UserPlusIcon,
  XIcon,
} from 'lucide-react';

import {
  listPeople,
  removePerson,
  revokeInvite,
  setPersonDisabled,
  signOutPerson,
  type PendingInvite,
  type PeopleResult,
  type Person,
} from '@/actions/users';
import { ROLE_INFO, seesAllGroups, type Role } from '@/lib/auth/roles';
import { formatAgo, formatDuration } from '@/lib/format';

import { TextSkeleton } from '@/components/common/skeletons';
import { attempt } from '@/components/common/toasts';
import { useKeptCount } from '@/components/common/use-kept';
import { InviteDialog } from '@/components/settings/invite-dialog';
import { EditAccessDialog } from '@/components/settings/people-access';
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

/** The groups someone sees, as a line: all of them, for an owner or admin. */
function groupsText(role: Role, groups: string[]) {
  if (seesAllGroups(role)) return 'Every group';
  return groups.length > 0 ? groups.join(', ') : 'No groups';
}

/** How long until a moment, as formatAgo says how long since one. */
function timeLeft(at: number) {
  return formatDuration(Math.max(0, (at - Date.now()) / 1000));
}

/**
 * Everyone with an account, and the invites still open: who they are, what
 * they may do and see, and whether they're about, each with what the owner
 * can do about them. The owner's alone.
 */
export function PeoplePanel() {
  const { data, error, mutate } = useSWR('people', () => listPeople());
  const [editing, setEditing] = useState<Person>();
  const [inviting, setInviting] = useState(false);
  const reload = () => void mutate();
  // While they're read, as many rows as last time
  const peopleRows = useKeptCount('people', data?.people.length, 1);
  const inviteRows = useKeptCount('invites', data?.invites.length, 0);

  if (error && !data) {
    return <p className='text-destructive'>Couldn&apos;t load the people</p>;
  }

  return (
    <div className='flex flex-col gap-6'>
      <section className='flex flex-col gap-2'>
        <h3 className='font-medium'>People</h3>
        {data ? (
          <ul className='flex flex-col divide-y divide-border'>
            {data.people.map((person) => (
              <PersonRow
                key={person.id}
                person={person}
                onEditAction={() => setEditing(person)}
                onChangedAction={reload}
              />
            ))}
          </ul>
        ) : (
          <RowsSkeleton rows={peopleRows} lines={3} />
        )}
      </section>

      <section className='flex flex-col gap-2'>
        <div className='flex items-center gap-2'>
          <h3 className='mr-auto font-medium'>Invites</h3>
          <Button
            variant='outline'
            size='sm'
            disabled={!data}
            onClick={() => setInviting(true)}
          >
            <UserPlusIcon />
            Invite someone
          </Button>
        </div>
        {!data ? (
          <RowsSkeleton rows={inviteRows} lines={2} />
        ) : data.invites.length === 0 ? (
          <p className='text-muted-foreground'>None waiting to be used.</p>
        ) : (
          <ul className='flex flex-col divide-y divide-border'>
            {data.invites.map((invite) => (
              <InviteRow
                key={invite.id}
                invite={invite}
                onChangedAction={reload}
              />
            ))}
          </ul>
        )}
      </section>

      <EditAccessDialog
        person={editing}
        allGroups={data?.groups ?? []}
        onCloseAction={() => setEditing(undefined)}
        onSavedAction={reload}
      />
      <InviteDialog
        open={inviting}
        allGroups={data?.groups ?? []}
        mail={data?.mail ?? false}
        onOpenChangeAction={setInviting}
        onCreatedAction={reload}
      />
    </div>
  );
}

/**
 * Rows where people or invites will be, as many as last time, each with as
 * many lines as theirs: a person's name, address and access; an invite's
 * address and access. None is the line saying so.
 */
function RowsSkeleton({ rows, lines }: { rows: number; lines: 2 | 3 }) {
  if (!rows) {
    return (
      <p>
        <TextSkeleton className='w-40' />
      </p>
    );
  }
  return (
    <ul
      aria-busy
      role='status'
      aria-label='Loading'
      className='flex flex-col divide-y divide-border'
    >
      {Array.from({ length: rows }, (_, i) => (
        <li key={i} className='flex flex-col gap-0.5 py-2'>
          <TextSkeleton className='w-32' />
          {lines === 3 && <TextSkeleton className='w-48' />}
          <TextSkeleton className='w-80 max-w-full' />
        </li>
      ))}
    </ul>
  );
}

/**
 * Runs one of a row's changes, saying how it went: the server's reason when
 * it refuses, as it does to removing the last owner.
 */
function useRowAction(onChanged: () => void) {
  const [pending, startTransition] = useTransition();

  function run(
    failed: string,
    work: () => Promise<PeopleResult>,
    done: string
  ) {
    startTransition(() =>
      attempt(failed, async () => {
        const result = await work();
        if (result?.error) {
          toast.error(failed, { description: result.error });
          return;
        }
        toast.success(done);
        onChanged();
      })
    );
  }

  return [pending, run] as const;
}

/**
 * One person: who, what they may do and see, whether they've two-factor on
 * and when they were last about; and for anyone but you, what can be done
 * about them. Your own account isn't yours to disable or remove here, and
 * signing yourself out everywhere is the account menu's.
 */
function PersonRow({
  person,
  onEditAction,
  onChangedAction,
}: {
  person: Person;
  onEditAction: () => void;
  onChangedAction: () => void;
}) {
  const [pending, run] = useRowAction(onChangedAction);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const { id, name } = person;
  const groups = groupsText(person.role, person.groups);

  return (
    <li className='flex items-start gap-3 py-2'>
      <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <div className='flex min-w-0 items-center gap-2'>
          <span className='truncate font-medium'>{name}</span>
          {person.you && <Badge variant='secondary'>You</Badge>}
          {person.disabled && <Badge variant='destructive'>Disabled</Badge>}
        </div>
        <span className='truncate text-muted-foreground'>{person.email}</span>
        <div className='flex flex-wrap gap-x-3 text-muted-foreground'>
          <span className='text-foreground'>{ROLE_INFO[person.role].name}</span>
          <span className='min-w-0 truncate' title={groups}>
            {groups}
          </span>
          <span>Two-factor {person.twoFactor ? 'on' : 'off'}</span>
          <span>
            {person.lastActive
              ? `Active ${formatAgo(person.lastActive)}`
              : 'Not signed in'}
          </span>
        </div>
      </div>
      {!person.you && (
        <div className='flex shrink-0 items-center gap-1'>
          <Button
            variant='outline'
            size='icon'
            aria-label={`Change ${name}'s access`}
            title='Change access'
            disabled={pending}
            onClick={onEditAction}
          >
            <PencilIcon />
          </Button>
          <Button
            variant='destructive'
            size='icon'
            aria-label={`Sign ${name} out everywhere`}
            title='Sign out everywhere'
            disabled={pending}
            onClick={() =>
              run(
                `Couldn't sign ${name} out`,
                () => signOutPerson(id),
                `Signed ${name} out everywhere`
              )
            }
          >
            <LogOutIcon />
          </Button>
          {person.disabled ? (
            <Button
              variant='outline'
              size='icon'
              aria-label={`Enable ${name}'s account`}
              title='Enable'
              disabled={pending}
              onClick={() =>
                run(
                  `Couldn't enable ${name}'s account`,
                  () => setPersonDisabled(id, false),
                  `${name} can sign in again`
                )
              }
            >
              <CircleCheckIcon />
            </Button>
          ) : (
            <Button
              variant='destructive'
              size='icon'
              aria-label={`Disable ${name}'s account`}
              title='Disable: signs them out, and keeps them out'
              disabled={pending}
              onClick={() =>
                run(
                  `Couldn't disable ${name}'s account`,
                  () => setPersonDisabled(id, true),
                  `Disabled ${name}'s account`
                )
              }
            >
              <BanIcon />
            </Button>
          )}
          <Button
            variant='destructive'
            size='icon'
            aria-label={`Remove ${name}`}
            title='Remove'
            disabled={pending}
            onClick={() => setConfirmRemove(true)}
          >
            <Trash2Icon />
          </Button>
          <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove {name}?</AlertDialogTitle>
                <AlertDialogDescription>
                  Their account goes, with its passkeys, and they&apos;re signed
                  out at once. To come back, they&apos;d need a new invite.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant='destructive'
                  onClick={() =>
                    run(
                      `Couldn't remove ${name}`,
                      () => removePerson(id),
                      `Removed ${name}`
                    )
                  }
                >
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </li>
  );
}

/** An invite not yet used: who it's for, what they'll have, and until when. */
function InviteRow({
  invite,
  onChangedAction,
}: {
  invite: PendingInvite;
  onChangedAction: () => void;
}) {
  const [pending, run] = useRowAction(onChangedAction);
  const { email } = invite;
  const groups = groupsText(invite.role, invite.groups);

  return (
    <li className='flex items-start gap-3 py-2'>
      <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <span className='truncate font-medium'>{email}</span>
        <div className='flex flex-wrap gap-x-3 text-muted-foreground'>
          <span className='text-foreground'>{ROLE_INFO[invite.role].name}</span>
          <span className='min-w-0 truncate' title={groups}>
            {groups}
          </span>
          <span>Expires in {timeLeft(invite.expiresAt)}</span>
          <span>Invited by {invite.invitedBy}</span>
        </div>
      </div>
      <Button
        variant='destructive'
        size='icon'
        aria-label={`Revoke the invite for ${email}`}
        title='Revoke: its link stops working'
        disabled={pending}
        onClick={() =>
          run(
            `Couldn't revoke the invite for ${email}`,
            () => revokeInvite(invite.id),
            `Revoked the invite for ${email}`
          )
        }
      >
        <XIcon />
      </Button>
    </li>
  );
}
