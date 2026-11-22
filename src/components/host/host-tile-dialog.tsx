'use client';

import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { saveHostTile } from '@/actions/tiles';

import {
  hasViews,
  HOST_TILE_VIEWS,
  viewOf,
  type HostTile,
} from '@/lib/host/host-tiles';

import { attempt } from '@/components/common/toasts';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';

/** One of the server's tiles: whether it's on the board, and what its graph shows at first. */
export function HostTileDialog({
  tile,
  onCloseAction,
  onSavedAction,
}: {
  tile?: HostTile;
  onCloseAction: () => void;
  onSavedAction: () => void;
}) {
  return (
    <Dialog open={!!tile} onOpenChange={(open) => !open && onCloseAction()}>
      <DialogContent>
        {tile && (
          <HostTileForm
            key={tile.key}
            tile={tile}
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

function HostTileForm({
  tile,
  onDone,
}: {
  tile: HostTile;
  onDone: () => void;
}) {
  const t = useTranslations('editTile');
  const tHost = useTranslations('host');
  const name = tHost(`tiles.${tile.key}`);
  const [hidden, setHidden] = useState(tile.hidden);
  const [view, setView] = useState<string | undefined>(
    hasViews(tile.key) ? viewOf(tile.key, tile.view) : undefined
  );
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();

  /** Each view's name, as on the tile's own switch */
  function viewLabel(value: string) {
    if (value === 'total') return tHost('total');
    if (value === 'cores') return tHost('perThread');
    if (value === 'both') return tHost('both');
    if (tile.key === 'network') return tHost(value === '0' ? 'down' : 'up');
    return tHost(value === '0' ? 'write' : 'read');
  }
  const views: readonly string[] = hasViews(tile.key)
    ? HOST_TILE_VIEWS[tile.key]
    : [];

  function save() {
    startTransition(() =>
      attempt(t('saveFailed', { name }), async () => {
        const result = await saveHostTile({ key: tile.key, hidden, view });
        if (result?.error) {
          setError(result.error);
          return;
        }
        toast.success(t('saved', { name }));
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
        <DialogTitle>{t('title')}</DialogTitle>
        <DialogDescription>{name}</DialogDescription>
      </DialogHeader>

      <div className='flex flex-col gap-4'>
        {views.length > 0 && (
          <div className='flex flex-col items-start gap-2'>
            <Label id='host-tile-view'>{t('showsAtFirst')}</Label>
            <ToggleGroup
              type='single'
              size='sm'
              variant='segmented'
              value={view}
              // Picking the shown one again would unpick it; keep one picked
              onValueChange={(v) => v && setView(v)}
              aria-labelledby='host-tile-view'
            >
              {views.map((v) => (
                <ToggleGroupItem key={v} value={v}>
                  {viewLabel(v)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </div>
        )}
        <div className='flex items-center gap-2'>
          <Switch
            id='host-tile-hidden'
            checked={hidden}
            onCheckedChange={setHidden}
          />
          <Label htmlFor='host-tile-hidden'>{t('hide')}</Label>
        </div>
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
