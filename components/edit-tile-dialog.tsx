'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { resetTile, restoreTile, saveTile } from '@/actions/tiles';
import type { Service } from '@/lib/types';

import { AddressesField, toItems } from '@/components/addresses-field';
import { GroupField } from '@/components/group-field';
import { IconField } from '@/components/icon-field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

/** How a service's tile looks: its name, icon, link and group. */
export function EditTileDialog({
  service,
  groups,
  onClose,
  onSaved,
}: {
  service?: Service;
  groups: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={!!service} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {service && (
          <EditTileForm
            key={service.key}
            service={service}
            groups={groups}
            onDone={() => {
              onSaved();
              onClose();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditTileForm({
  service,
  groups,
  onDone,
}: {
  service: Service;
  groups: string[];
  onDone: () => void;
}) {
  const [name, setName] = useState(service.name);
  const [icon, setIcon] = useState(service.icon);
  const [addresses, setAddresses] = useState(() => toItems(service.addresses));
  const [group, setGroup] = useState(service.group);
  const [hidden, setHidden] = useState(service.hidden);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await saveTile({
        key: service.key,
        name,
        icon,
        addresses: addresses.map((a) => a.value),
        group,
        hidden,
      });
      if (result?.error) {
        setError(result.error);
        return;
      }
      toast.success(`Saved ${name}`);
      onDone();
    });
  }

  function reset() {
    startTransition(async () => {
      const before = await resetTile(service.key);
      toast.success(`Reset ${service.name}`, {
        description:
          'Its name, icon, addresses and group are back to defaults.',
        action: before && {
          label: 'Undo',
          onClick: async () => {
            await restoreTile(before);
            toast.success(`Restored ${before.name ?? service.name}`);
            onDone();
          },
        },
      });
      onDone();
    });
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
        <DialogTitle>Edit tile</DialogTitle>
        <DialogDescription className='font-mono'>
          {service.containerName}
        </DialogDescription>
      </DialogHeader>

      <div className='flex flex-col gap-4'>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='tile-name'>Name</Label>
          <Input
            id='tile-name'
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='tile-icon'>Icon</Label>
          <IconField
            id='tile-icon'
            value={icon}
            name={name}
            onChange={setIcon}
          />
        </div>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='tile-addresses'>Addresses</Label>
          <AddressesField
            id='tile-addresses'
            items={addresses}
            onChange={setAddresses}
          />
        </div>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='tile-group'>Group</Label>
          <GroupField
            id='tile-group'
            value={group}
            groups={groups}
            onChange={setGroup}
          />
        </div>
        <div className='flex items-center gap-2'>
          <Switch
            id='tile-hidden'
            checked={hidden}
            onCheckedChange={setHidden}
          />
          <Label htmlFor='tile-hidden'>Hide from the dashboard</Label>
        </div>
        {error && <p className='text-destructive'>{error}</p>}
      </div>

      <DialogFooter>
        {service.edited && (
          <Button
            type='button'
            variant='ghost'
            disabled={pending}
            onClick={reset}
            className='sm:mr-auto'
          >
            Reset
          </Button>
        )}
        <Button type='submit' disabled={pending}>
          Save
        </Button>
      </DialogFooter>
    </form>
  );
}
