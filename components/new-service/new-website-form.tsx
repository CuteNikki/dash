'use client';

import { useState, useTransition, type ReactNode } from 'react';
import { toast } from 'sonner';

import { addSite } from '@/actions/tiles';
import { MAX_DESCRIPTION } from '@/lib/dashboard/tiles';

import { GroupField } from '@/components/dashboard/fields/group-field';
import { Button } from '@/components/ui/button';
import {
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/**
 * Adds a website hosted elsewhere, such as on Vercel, as a tile: nothing on
 * the server, just its name and address, which the dashboard then checks.
 */
export function NewWebsiteForm({
  hidden,
  picker,
  groups,
  onCreated,
}: {
  hidden: boolean;
  /** Where to start from, Template, docker run or Website, under the heading */
  picker: ReactNode;
  groups: string[];
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [group, setGroup] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function create() {
    startTransition(async () => {
      const result = await addSite({ name, address, group, description });
      if (result?.error) {
        setError(result.error);
        return;
      }
      toast.success(`Added ${name.trim()}`);
      onCreated();
    });
  }

  return (
    <form
      hidden={hidden}
      className='contents'
      onSubmit={(e) => {
        e.preventDefault();
        create();
      }}
    >
      <DialogHeader>
        <DialogTitle>New website</DialogTitle>
        <DialogDescription>
          A site hosted somewhere else, as a tile that shows whether it’s up and
          how fast it answers. Nothing changes on the server.
        </DialogDescription>
      </DialogHeader>

      <fieldset disabled={pending} className='contents'>
        {picker}
        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='website-name'>Name</Label>
            <Input
              id='website-name'
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='Portfolio'
              autoComplete='off'
              required
            />
          </div>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='website-group'>Group</Label>
            <GroupField
              id='website-group'
              value={group}
              groups={groups}
              onChange={setGroup}
              optional
            />
          </div>
        </div>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='website-address'>Address</Label>
          <Input
            id='website-address'
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            placeholder='https://example.vercel.app'
            inputMode='url'
            className='font-mono'
            autoComplete='off'
            required
          />
        </div>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='website-description'>
            Description{' '}
            <span className='text-muted-foreground'>(optional)</span>
          </Label>
          <Input
            id='website-description'
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={MAX_DESCRIPTION}
            placeholder='A short line under its name'
          />
        </div>
        {error && <p className='text-destructive'>{error}</p>}
      </fieldset>

      <DialogFooter>
        <Button type='submit' disabled={pending}>
          {pending ? 'Adding…' : 'Add website'}
        </Button>
      </DialogFooter>
    </form>
  );
}
