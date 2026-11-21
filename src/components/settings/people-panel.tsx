'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';

import {
  BanIcon,
  CircleCheckIcon,
  ClockIcon,
  HourglassIcon,
  LayersIcon,
  LogOutIcon,
  PencilIcon,
  ShieldCheckIcon,
  ShieldOffIcon,
  Trash2Icon,
  UserIcon,
  UserPlusIcon,
  XIcon,
} from 'lucide-react';

import {
  listPeople,
  removePerson,
  revokeInvite,
  setPersonDisabled,
  setTwoFactorRequired,
  signOutPerson,
  type PendingInvite,
  type PeopleResult,
  type Person,
} from '@/actions/users';

import type { Format } from '@/i18n/format';
import { useFormat } from '@/i18n/use-format';

import { ROLES, seesAllGroups, type Role } from '@/lib/auth/roles';

import { TextSkeleton } from '@/components/common/skeletons';
import { attempt } from '@/components/common/toasts';
import { useKeptCount } from '@/components/common/use-kept';
import { InviteDialog } from '@/components/settings/invite-dialog';
import { EditAccessDialog } from '@/components/settings/people-access';
import {
  SettingsItem,
  SettingsRow,
  SettingsSection,
} from '@/components/settings/section';
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
import { Switch } from '@/components/ui/switch';

type PeopleTranslator = ReturnType<typeof useTranslations<'people'>>;

/** The groups someone sees, as a line: all of them, for an owner or admin. */
function groupsText(
  role: Role,
  groups: string[],
  everyGroup: boolean,
  t: PeopleTranslator
) {
  if (seesAllGroups(role) || everyGroup) return t('everyGroup');
  return groups.length > 0 ? groups.join(', ') : t('noGroups');
}

/** How long until a moment, as format.ago says how long since one. */
function timeLeft(at: number, format: Format) {
  return format.duration(Math.max(0, (at - Date.now()) / 1000));
}

/**
 * Everyone with an account, and the invites still open: who they are, what
 * they may do and see, and whether they're about, each with what the owner
 * can do about them. The owner's alone.
 */
export function PeoplePanel() {
  const t = useTranslations('people');
  const { data, error, mutate } = useSWR('people', () => listPeople());
  const [editing, setEditing] = useState<Person>();
  const [inviting, setInviting] = useState(false);
  const reload = () => void mutate();
  // While they're read, as many rows as last time
  const peopleRows = useKeptCount('people', data?.people.length, 1);
  const inviteRows = useKeptCount('invites', data?.invites.length, 0);

  if (error && !data) {
    return <p className='text-destructive'>{t('loadFailed')}</p>;
  }

  return (
    <div className='flex flex-col gap-6'>
      <SettingsSection title={t('people')} description={t('peopleDescription')}>
        {data ? (
          data.people.map((person) => (
            <PersonRow
              key={person.id}
              person={person}
              onEditAction={() => setEditing(person)}
              onChangedAction={reload}
            />
          ))
        ) : (
          <RowsSkeleton rows={peopleRows} lines={3} />
        )}
      </SettingsSection>

      <TwoFactorRoles
        people={data?.people}
        required={data?.twoFactorRoles}
        onChangedAction={reload}
      />

      <SettingsSection
        title={t('invites')}
        description={t('invitesDescription')}
        action={
          <Button
            variant='outline'
            size='sm'
            disabled={!data}
            onClick={() => setInviting(true)}
          >
            <UserPlusIcon />
            {t('invite')}
          </Button>
        }
      >
        {!data ? (
          <RowsSkeleton rows={inviteRows} lines={2} />
        ) : data.invites.length === 0 ? (
          <SettingsItem>
            <p className='text-muted-foreground'>{t('noInvites')}</p>
          </SettingsItem>
        ) : (
          data.invites.map((invite) => (
            <InviteRow
              key={invite.id}
              invite={invite}
              onChangedAction={reload}
            />
          ))
        )}
      </SettingsSection>

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
 * The facts under a person or invite, each with its icon so it reads as its
 * own, dots between: a long one, as many groups, is cut short in its place.
 */
function RowFacts({
  facts,
}: {
  facts: { icon: React.ReactNode; text: string }[];
}) {
  return (
    <div className='flex min-w-0 flex-wrap items-center gap-x-2 text-muted-foreground [&_svg]:size-3.5 [&_svg]:shrink-0'>
      {facts.map(({ icon, text }, i) => (
        <span key={i} className='flex min-w-0 items-center gap-2'>
          {i > 0 && <span aria-hidden>·</span>}
          <span className='flex min-w-0 items-center gap-1'>
            {icon}
            <span className='truncate' title={text}>
              {text}
            </span>
          </span>
        </span>
      ))}
    </div>
  );
}

/**
 * Rows where people or invites will be, as many as last time, each with as
 * many lines as theirs: a person's name, address and access; an invite's
 * address and access. None is the line saying so.
 */
function RowsSkeleton({ rows, lines }: { rows: number; lines: 2 | 3 }) {
  const t = useTranslations('people');
  if (!rows) {
    return (
      <SettingsItem>
        <TextSkeleton className='w-40' />
      </SettingsItem>
    );
  }
  return Array.from({ length: rows }, (_, i) => (
    <SettingsItem
      key={i}
      className='flex-col items-start gap-0.5'
      aria-busy
      aria-label={t('loading')}
    >
      <TextSkeleton className='w-32' />
      {lines === 3 && <TextSkeleton className='w-48' />}
      <TextSkeleton className='w-80 max-w-full' />
    </SettingsItem>
  ));
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
  const format = useFormat();
  const tr = useTranslations('roles');
  const t = useTranslations('people');
  const [pending, run] = useRowAction(onChangedAction);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const { id, name } = person;
  const groups = groupsText(person.role, person.groups, person.everyGroup, t);

  return (
    <SettingsItem className='items-start'>
      <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <div className='flex min-w-0 items-center gap-2'>
          <span className='truncate font-medium'>{name}</span>
          {person.you && <Badge variant='secondary'>{t('you')}</Badge>}
          <Badge variant='outline'>{tr(`${person.role}.name`)}</Badge>
          {person.disabled && (
            <Badge variant='destructive'>{t('disabled')}</Badge>
          )}
        </div>
        <span className='truncate text-muted-foreground'>{person.email}</span>
        <RowFacts
          facts={[
            { icon: <LayersIcon />, text: groups },
            {
              icon: person.twoFactor ? <ShieldCheckIcon /> : <ShieldOffIcon />,
              text: person.twoFactor ? t('twoFactorOn') : t('twoFactorOff'),
            },
            {
              icon: <ClockIcon />,
              text: person.lastActive
                ? t('active', { ago: format.ago(person.lastActive) })
                : t('notSignedIn'),
            },
          ]}
        />
      </div>
      {!person.you && (
        <div className='flex shrink-0 items-center gap-1'>
          <Button
            variant='outline'
            size='icon'
            aria-label={t('changeAccessOf', { name })}
            title={t('changeAccess')}
            disabled={pending}
            onClick={onEditAction}
          >
            <PencilIcon />
          </Button>
          <Button
            variant='destructive'
            size='icon'
            aria-label={t('signOutEverywhereOf', { name })}
            title={t('signOutEverywhere')}
            disabled={pending}
            onClick={() =>
              run(
                t('signOutFailed', { name }),
                () => signOutPerson(id),
                t('signedOut', { name })
              )
            }
          >
            <LogOutIcon />
          </Button>
          {person.disabled ? (
            <Button
              variant='outline'
              size='icon'
              aria-label={t('enableOf', { name })}
              title={t('enable')}
              disabled={pending}
              onClick={() =>
                run(
                  t('enableFailed', { name }),
                  () => setPersonDisabled(id, false),
                  t('enabled', { name })
                )
              }
            >
              <CircleCheckIcon />
            </Button>
          ) : (
            <Button
              variant='destructive'
              size='icon'
              aria-label={t('disableOf', { name })}
              title={t('disable')}
              disabled={pending}
              onClick={() =>
                run(
                  t('disableFailed', { name }),
                  () => setPersonDisabled(id, true),
                  t('disabledToast', { name })
                )
              }
            >
              <BanIcon />
            </Button>
          )}
          <Button
            variant='destructive'
            size='icon'
            aria-label={t('removeOf', { name })}
            title={t('remove')}
            disabled={pending}
            onClick={() => setConfirmRemove(true)}
          >
            <Trash2Icon />
          </Button>
          <AlertDialog open={confirmRemove} onOpenChange={setConfirmRemove}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  {t('removeTitle', { name })}
                </AlertDialogTitle>
                <AlertDialogDescription>
                  {t('removeDescription')}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>{t('cancel')}</AlertDialogCancel>
                <AlertDialogAction
                  variant='destructive'
                  onClick={() =>
                    run(
                      t('removeFailed', { name }),
                      () => removePerson(id),
                      t('removed', { name })
                    )
                  }
                >
                  {t('remove')}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}
    </SettingsItem>
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
  const format = useFormat();
  const tr = useTranslations('roles');
  const t = useTranslations('people');
  const [pending, run] = useRowAction(onChangedAction);
  const { email } = invite;
  const groups = groupsText(invite.role, invite.groups, invite.everyGroup, t);

  return (
    <SettingsItem className='items-start'>
      <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <div className='flex min-w-0 items-center gap-2'>
          <span className='truncate font-medium'>{email}</span>
          <Badge variant='outline'>{tr(`${invite.role}.name`)}</Badge>
        </div>
        <RowFacts
          facts={[
            { icon: <LayersIcon />, text: groups },
            {
              icon: <HourglassIcon />,
              text: t('expiresIn', {
                duration: timeLeft(invite.expiresAt, format),
              }),
            },
            {
              icon: <UserIcon />,
              text: t('invitedBy', { name: invite.invitedBy }),
            },
          ]}
        />
      </div>
      <Button
        variant='destructive'
        size='icon'
        aria-label={t('revokeOf', { email })}
        title={t('revoke')}
        disabled={pending}
        onClick={() =>
          run(
            t('revokeFailed', { email }),
            () => revokeInvite(invite.id),
            t('revoked', { email })
          )
        }
      >
        <XIcon />
      </Button>
    </SettingsItem>
  );
}

/**
 * Which roles require two-factor, a switch each, with how many of their
 * people have no authenticator app yet: signed in with their password
 * alone, they're sent to set one up; a passkey's sign-in is let through.
 */
function TwoFactorRoles({
  people,
  required,
  onChangedAction,
}: {
  people?: Person[];
  required?: Role[];
  onChangedAction: () => void;
}) {
  const t = useTranslations('people');
  const tr = useTranslations('roles');
  const [pending, startTransition] = useTransition();

  function set(role: Role, on: boolean) {
    startTransition(() =>
      attempt(t('twoFactorFailed'), async () => {
        const result = await setTwoFactorRequired(role, on);
        if (result?.error) {
          toast.error(t('twoFactorFailed'), { description: result.error });
          return;
        }
        onChangedAction();
      })
    );
  }

  return (
    <SettingsSection
      title={t('twoFactorTitle')}
      description={t('twoFactorDescription')}
    >
      {ROLES.map((role) => {
        const on = !!required?.includes(role);
        const inRole = people?.filter((p) => p.role === role) ?? [];
        const missing = inRole.filter((p) => !p.twoFactor).length;
        return (
          <SettingsRow
            key={role}
            label={tr(`${role}.name`)}
            htmlFor={`two-factor-${role}`}
            // Always a line, so the rows keep their height as it changes
            hint={
              !people ? (
                <TextSkeleton className='w-40' />
              ) : (
                t('roleStatus', {
                  count: inRole.length,
                  status: !on
                    ? 'notRequired'
                    : missing
                      ? 'missing'
                      : inRole.length
                        ? 'allSet'
                        : 'none',
                  missing,
                })
              )
            }
          >
            <Switch
              id={`two-factor-${role}`}
              checked={on}
              disabled={!required || pending}
              onCheckedChange={(next) => set(role, next)}
            />
          </SettingsRow>
        );
      })}
    </SettingsSection>
  );
}
