'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { resetTile, restoreTile, saveTile } from '@/actions/tiles';

import { useWords } from '@/i18n/use-words';

import {
  isSiteKey,
  MAX_DESCRIPTION,
  type TileGraph,
} from '@/lib/dashboard/tiles';
import type { Service, StatKey } from '@/lib/types';

import { allWidgetStats } from '@/components/charts/widget-stats';
import { attempt } from '@/components/common/toasts';
import {
  AddressesField,
  toItems,
} from '@/components/dashboard/fields/addresses-field';
import { GroupField } from '@/components/dashboard/fields/group-field';
import { IconField } from '@/components/dashboard/fields/icon-field';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

/** How a service's tile looks: its name, description, icon, addresses, group and the numbers on it. */
export function EditTileDialog({
  service,
  groups,
  onCloseAction,
  onSavedAction,
}: {
  service?: Service;
  groups: string[];
  onCloseAction: () => void;
  onSavedAction: () => void;
}) {
  return (
    <Dialog open={!!service} onOpenChange={(open) => !open && onCloseAction()}>
      <DialogContent>
        {service && (
          <EditTileForm
            key={service.key}
            service={service}
            groups={groups}
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

function EditTileForm({
  service,
  groups,
  onDone,
}: {
  service: Service;
  groups: string[];
  onDone: () => void;
}) {
  const t = useTranslations('editTile');
  const words = useWords();
  const [name, setName] = useState(service.name);
  const [description, setDescription] = useState(service.description ?? '');
  const [icon, setIcon] = useState(service.icon);
  const [addresses, setAddresses] = useState(() => toItems(service.addresses));
  const [group, setGroup] = useState(service.group);
  const [hidden, setHidden] = useState(service.hidden);
  const [ignoreUpdates, setIgnoreUpdates] = useState(service.ignoreUpdates);
  const [hiddenStats, setHiddenStats] = useState(service.hiddenStats);
  const [hiddenGraphs, setHiddenGraphs] = useState(service.hiddenGraphs);
  // A website's response time, or a container's CPU and memory
  const graphKeys: TileGraph[] = isSiteKey(service.key)
    ? ['response']
    : ['cpu', 'memory'];
  // Its app's numbers as last read, and any left off it that it hasn't
  // said this time, as a stream's fallback only while it's on
  const read = allWidgetStats(service)?.map((s) => s.label) ?? [];
  const statKeys = [
    ...read,
    ...service.hiddenStats.filter((k) => !read.includes(k as StatKey)),
  ] as StatKey[];
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(() =>
      attempt(t('saveFailed', { name }), async () => {
        const result = await saveTile({
          key: service.key,
          name,
          description,
          icon,
          addresses: addresses.map((a) => a.value),
          group,
          hidden,
          ignoreUpdates,
          hiddenStats,
          hiddenGraphs,
        });
        if (result?.error) {
          setError(result.error);
          return;
        }
        toast.success(t('saved', { name }));
        onDone();
      })
    );
  }

  // A website elsewhere is nothing but its tile, so resetting it removes it
  const site = isSiteKey(service.key);

  function reset() {
    startTransition(() =>
      attempt(
        t(site ? 'removeFailed' : 'resetFailed', { name: service.name }),
        async () => {
          const before = await resetTile(service.key);
          toast.success(t(site ? 'removed' : 'reset', { name: service.name }), {
            description: t(site ? 'removedDescription' : 'resetDescription'),
            action: before && {
              label: t('undo'),
              onClick: () =>
                attempt(
                  t('restoreFailed', { name: service.name }),
                  async () => {
                    await restoreTile(before);
                    toast.success(
                      t('restored', { name: before.name ?? service.name })
                    );
                    onDone();
                  }
                ),
            },
          });
          onDone();
        }
      )
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
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription className='font-mono'>
          {service.containerName}
        </DialogDescription>
      </DialogHeader>

      <div className='flex flex-col gap-4'>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='tile-name'>{t('name')}</Label>
          <Input
            id='tile-name'
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='tile-description'>{t('description')}</Label>
          <Input
            id='tile-description'
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={MAX_DESCRIPTION}
            placeholder={t('descriptionPlaceholder')}
          />
        </div>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='tile-icon'>{t('icon')}</Label>
          <IconField
            id='tile-icon'
            value={icon}
            name={name}
            onChangeAction={setIcon}
          />
        </div>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='tile-addresses'>{t('addresses')}</Label>
          <AddressesField
            id='tile-addresses'
            items={addresses}
            onChangeAction={setAddresses}
          />
        </div>
        <div className='flex flex-col gap-2'>
          <Label htmlFor='tile-group'>{t('group')}</Label>
          <GroupField
            id='tile-group'
            value={group}
            groups={groups}
            onChangeAction={setGroup}
          />
        </div>
        {statKeys.length > 0 && (
          <fieldset className='flex flex-col gap-2'>
            <legend className='mb-2'>{t('numbers')}</legend>
            {/* Each as the chip it is on the tile, ticked while it's there */}
            <div className='flex flex-wrap gap-1.5'>
              {statKeys.map((key) => (
                <Label
                  key={key}
                  className='flex items-center gap-1.5 rounded-md bg-muted px-1.5 py-1 font-normal'
                >
                  <Checkbox
                    checked={!hiddenStats.includes(key)}
                    onCheckedChange={(on) =>
                      setHiddenStats((list) =>
                        on ? list.filter((k) => k !== key) : [...list, key]
                      )
                    }
                  />
                  {words.label(key)}
                </Label>
              ))}
            </div>
          </fieldset>
        )}
        <fieldset className='flex flex-col gap-2'>
          <legend className='mb-2'>{t('graphs')}</legend>
          {/* As the numbers above: each ticked while it's on the tile */}
          <div className='flex flex-wrap gap-1.5'>
            {graphKeys.map((key) => (
              <Label
                key={key}
                className='flex items-center gap-1.5 rounded-md bg-muted px-1.5 py-1 font-normal'
              >
                <Checkbox
                  checked={!hiddenGraphs.includes(key)}
                  onCheckedChange={(on) =>
                    setHiddenGraphs((list) =>
                      on ? list.filter((k) => k !== key) : [...list, key]
                    )
                  }
                />
                {t(`graph.${key}`)}
              </Label>
            ))}
          </div>
        </fieldset>
        <div className='flex items-center gap-2'>
          <Switch
            id='tile-hidden'
            checked={hidden}
            onCheckedChange={setHidden}
          />
          <Label htmlFor='tile-hidden'>{t('hide')}</Label>
        </div>
        {/* A website elsewhere has no image to update */}
        {!site && (
          <div className='flex items-center gap-2'>
            <Switch
              id='tile-ignore-updates'
              checked={ignoreUpdates}
              onCheckedChange={setIgnoreUpdates}
            />
            <Label htmlFor='tile-ignore-updates'>{t('ignoreUpdates')}</Label>
          </div>
        )}
        {error && <p className='text-destructive'>{error}</p>}
      </div>

      <DialogFooter>
        {service.edited && (
          <Button
            type='button'
            variant={site ? 'destructive' : 'ghost'}
            disabled={pending}
            onClick={reset}
            className='mr-auto'
          >
            {t(site ? 'remove' : 'resetButton')}
          </Button>
        )}
        <Button type='submit' disabled={pending}>
          {t('save')}
        </Button>
      </DialogFooter>
    </form>
  );
}
