'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { setPersonAccess, type Person } from '@/actions/users';

import { isRole, ROLES, seesAllGroups, type Role } from '@/lib/auth/roles';

import { attempt } from '@/components/common/toasts';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

/**
 * What someone may do, and for an operator or viewer, the groups they see:
 * the same two pickers for changing someone's access and for inviting them.
 * An owner or admin sees every group, so theirs are left as they were rather
 * than cleared, and are back if they're made an operator again.
 */
export function AccessFields({
  id,
  role,
  groups,
  everyGroup,
  allGroups,
  onRoleChangeAction,
  onGroupsChangeAction,
  onEveryGroupChangeAction,
}: {
  id: string;
  role: Role;
  groups: string[];
  /** Every group, new ones too, rather than those ticked */
  everyGroup: boolean;
  /** Every group there is to give */
  allGroups: string[];
  onRoleChangeAction: (role: Role) => void;
  onGroupsChangeAction: (groups: string[]) => void;
  onEveryGroupChangeAction: (every: boolean) => void;
}) {
  const tr = useTranslations('roles');
  const t = useTranslations('people');
  // Any they have that's no longer on the dashboard too, so it can be taken off
  const choices = [
    ...allGroups,
    ...groups.filter((g) => !allGroups.includes(g)),
  ];

  function toggle(group: string, on: boolean) {
    onGroupsChangeAction(
      on ? [...groups, group] : groups.filter((g) => g !== group)
    );
  }

  return (
    <>
      <div className='flex flex-col gap-2'>
        <Label id={`${id}-role`}>{t('role')}</Label>
        <ToggleGroup
          type='single'
          variant='segmented'
          aria-labelledby={`${id}-role`}
          value={role}
          // Picking the one that's on would leave none; it stays instead
          onValueChange={(value) => isRole(value) && onRoleChangeAction(value)}
        >
          {ROLES.map((r) => (
            <ToggleGroupItem key={r} value={r}>
              {tr(`${r}.name`)}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        <p className='text-muted-foreground'>{tr(`${role}.description`)}</p>
      </div>
      {seesAllGroups(role) ? null : (
        <div className='flex flex-col gap-2'>
          <Label id={`${id}-groups`}>{t('groups')}</Label>
          <div className='flex items-center gap-2'>
            <Checkbox
              id={`${id}-every-group`}
              checked={everyGroup}
              onCheckedChange={(c) => onEveryGroupChangeAction(c === true)}
            />
            <Label htmlFor={`${id}-every-group`} className='font-normal'>
              {t('everyGroupToo')}
            </Label>
          </div>
          {choices.length === 0 ? (
            <p className='text-muted-foreground'>{t('noGroupsYet')}</p>
          ) : (
            <ul
              aria-labelledby={`${id}-groups`}
              className='flex max-h-48 flex-col gap-2 overflow-y-auto rounded-md border border-border bg-field p-2'
            >
              {choices.map((group) => (
                <li key={group} className='flex items-center gap-2'>
                  <Checkbox
                    id={`${id}-group-${group}`}
                    // Each ticked and off while every one's given
                    checked={everyGroup || groups.includes(group)}
                    disabled={everyGroup}
                    onCheckedChange={(c) => toggle(group, c === true)}
                  />
                  <Label
                    htmlFor={`${id}-group-${group}`}
                    className='min-w-0 truncate font-normal'
                  >
                    {group}
                  </Label>
                </li>
              ))}
            </ul>
          )}
          {!everyGroup && groups.length === 0 && choices.length > 0 && (
            <p className='text-muted-foreground'>{t('noneSeesNothing')}</p>
          )}
        </div>
      )}
    </>
  );
}

/** Changes what someone may do and the groups they see, from their next click. */
export function EditAccessDialog({
  person,
  allGroups,
  onCloseAction,
  onSavedAction,
}: {
  person?: Person;
  allGroups: string[];
  onCloseAction: () => void;
  onSavedAction: () => void;
}) {
  return (
    <Dialog open={!!person} onOpenChange={(open) => !open && onCloseAction()}>
      <DialogContent>
        {person && (
          <EditAccessForm
            key={person.id}
            person={person}
            allGroups={allGroups}
            onDone={() => {
              onSavedAction();
              onCloseAction();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditAccessForm({
  person,
  allGroups,
  onDone,
}: {
  person: Person;
  allGroups: string[];
  onDone: () => void;
}) {
  const t = useTranslations('people');
  const [role, setRole] = useState(person.role);
  const [groups, setGroups] = useState(person.groups);
  const [everyGroup, setEveryGroup] = useState(person.everyGroup);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(() =>
      attempt(t('accessFailed', { name: person.name }), async () => {
        const result = await setPersonAccess(person.id, {
          role,
          groups,
          everyGroup,
        });
        if (result?.error) {
          setError(result.error);
          return;
        }
        toast.success(t('accessChanged', { name: person.name }), {
          description: t('accessApplies'),
        });
        onDone();
      })
    );
  }

  return (
    <form
      className='flex flex-col gap-6'
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <DialogHeader>
        <DialogTitle>{t('accessTitle', { name: person.name })}</DialogTitle>
        <DialogDescription>{person.email}</DialogDescription>
      </DialogHeader>
      <div className='flex flex-col gap-4'>
        <AccessFields
          id='edit-access'
          role={role}
          groups={groups}
          everyGroup={everyGroup}
          allGroups={allGroups}
          onRoleChangeAction={setRole}
          onGroupsChangeAction={setGroups}
          onEveryGroupChangeAction={setEveryGroup}
        />
        {error && <p className='text-destructive'>{error}</p>}
      </div>
      <DialogFooter>
        <Button type='submit' disabled={pending}>
          {t('save')}
        </Button>
      </DialogFooter>
    </form>
  );
}
