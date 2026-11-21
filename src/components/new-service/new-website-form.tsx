'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition, type ReactNode } from 'react';
import { toast } from 'sonner';

import { addSite } from '@/actions/tiles';

import { DEFAULT_GROUP } from '@/lib/dashboard/groups';
import { MAX_DESCRIPTION } from '@/lib/dashboard/tiles';
import type { Service } from '@/lib/types';

import { attempt } from '@/components/common/toasts';
import { GroupField } from '@/components/dashboard/fields/group-field';
import { ServiceTile } from '@/components/dashboard/service-tile';
import { Button } from '@/components/ui/button';
import { DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/** Where a typed address points, if it's one; with https:// assumed, as the dashboard does. */
function urlOf(address: string) {
  const typed = address.trim();
  if (!typed) return undefined;
  try {
    return new URL(/^https?:\/\//i.test(typed) ? typed : `https://${typed}`);
  } catch {
    return undefined;
  }
}

/**
 * The tile a website will be, before it's added: its name, address and
 * icon as the board shows them, and its uptime still to be checked.
 */
function previewOf(
  name: string,
  address: string,
  description: string,
  group: string
): Service {
  const url = urlOf(address);
  return {
    key: 'site:preview',
    containerId: '',
    containerName: '',
    name: name.trim() || url?.host || 'Portfolio',
    group: group || DEFAULT_GROUP,
    // Its own icon, as the board takes it before the page has been read
    icon: url ? `${url.origin}/favicon.ico` : '',
    addresses: [address.trim() || 'example.vercel.app'],
    url: url?.href,
    description: description.trim() || undefined,
    width: 1,
    height: 1,
    hidden: false,
    ignoreUpdates: false,
    hiddenStats: [],
    edited: false,
    image: '',
    state: 'running',
    status: '',
    removable: false,
    console: false,
    site: {},
  };
}

/**
 * Adds a website hosted elsewhere, such as on Vercel, as a tile: nothing on
 * the server, just its name and address, which the dashboard then checks.
 */
export function NewWebsiteForm({
  hidden,
  picker,
  groups,
  onCreatedAction,
}: {
  hidden: boolean;
  /** Where to start from, Template, docker run or Website, under the window's heading */
  picker: ReactNode;
  groups: string[];
  onCreatedAction: () => void;
}) {
  const t = useTranslations('newService');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [group, setGroup] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function create() {
    startTransition(() =>
      attempt(t('addFailed', { name: name.trim() }), async () => {
        const result = await addSite({ name, address, group, description });
        if (result?.error) {
          setError(result.error);
          return;
        }
        toast.success(t('added', { name: name.trim() }));
        onCreatedAction();
      })
    );
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
      <fieldset disabled={pending} className='contents'>
        {picker}
        <div className='grid gap-4 sm:grid-cols-2'>
          <div className='flex flex-col gap-2'>
            <Label htmlFor='website-name'>{t('name')}</Label>
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
            <Label htmlFor='website-group'>{t('group')}</Label>
            <GroupField
              id='website-group'
              value={group}
              groups={groups}
              onChangeAction={setGroup}
              optional
            />
          </div>
        </div>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='website-address'>{t('address')}</Label>
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
          <Label htmlFor='website-description'>{t('description')}</Label>
          <Input
            id='website-description'
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={MAX_DESCRIPTION}
            placeholder={t('descriptionPlaceholder')}
          />
        </div>
        {error && <p className='text-destructive'>{error}</p>}
        {/* The tile it'll be, as it's typed, in the room the other starting
            points' editors take, so the window has no empty space and its
            button stays where theirs is */}
        <section aria-label={t('preview')} className='flex grow flex-col gap-2'>
          <span className='text-xs/relaxed font-medium'>{t('preview')}</span>
          <div className='flex grow items-center justify-center rounded-lg bg-muted/50 p-6'>
            {/* Only to look at: clicking it would open nothing */}
            <div inert className='w-full max-w-xs'>
              <ServiceTile
                service={previewOf(name, address, description, group)}
                editing={false}
                onOpen={() => {}}
              />
            </div>
          </div>
        </section>
      </fieldset>

      <DialogFooter>
        <Button type='submit' disabled={pending}>
          {pending ? t('adding') : t('addWebsite')}
        </Button>
      </DialogFooter>
    </form>
  );
}
