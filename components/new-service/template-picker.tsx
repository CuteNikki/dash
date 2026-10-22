'use client';

import { useDeferredValue, useState } from 'react';
import useSWR from 'swr';

import { BadgeCheckIcon, FileIcon, SearchIcon } from 'lucide-react';

import { fetcher } from '@/lib/fetcher';
import type { HubImage } from '@/lib/image-search';
import {
  blankTemplate,
  CURATED,
  type ServiceTemplate,
} from '@/lib/service-templates';
import { cn } from '@/lib/utils';

import { ScrollFade } from '@/components/common/scroll-fade';
import { ServiceIcon } from '@/components/service/service-icon';
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group';

/** A choice in the picker, its own background, ringed when picked. */
const CHOICE =
  'flex min-w-0 items-center gap-3 rounded-lg border border-transparent bg-muted p-2.5 text-left outline-none hover:border-border focus-visible:ring-2 focus-visible:ring-ring aria-pressed:border-ring';

/**
 * What a new service starts from: a template of a popular app (LinuxServer.io's
 * catalogue and a few big apps besides, the latter showing until the rest
 * come), a blank one, or any image on Docker Hub. Searching narrows the
 * templates and finds images on Hub too, which only fill in the image, Hub
 * not saying what port or folders one needs.
 */
export function TemplatePicker({
  picked,
  onPick,
}: {
  picked: ServiceTemplate;
  onPick: (template: ServiceTemplate) => void;
}) {
  const [search, setSearch] = useState('');
  const typed = search.trim().toLowerCase();
  // Searches as typing pauses, keeping the last images up meanwhile
  const query = useDeferredValue(typed);
  const { data: images, error } = useSWR<HubImage[]>(
    query.length >= 2 ? `/api/images?q=${encodeURIComponent(query)}` : null,
    fetcher,
    { keepPreviousData: true, revalidateOnFocus: false }
  );
  const { data: all = CURATED } = useSWR<ServiceTemplate[]>(
    '/api/templates',
    fetcher,
    { revalidateOnFocus: false }
  );
  const templates = all.filter((t) =>
    `${t.name} ${t.description} ${t.image}`.toLowerCase().includes(typed)
  );

  return (
    <div className='flex flex-col gap-2'>
      <InputGroup>
        <InputGroupAddon>
          <SearchIcon />
        </InputGroupAddon>
        <InputGroupInput
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder='Search apps, or any image on Docker Hub'
          aria-label='Search apps and images'
        />
      </InputGroup>
      <ScrollFade
        fadeFrom='from-popover'
        className='grid max-h-72 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2'
      >
        {!typed && (
          <button
            type='button'
            className={CHOICE}
            aria-pressed={!picked.id && !picked.image}
            onClick={() => onPick(blankTemplate())}
          >
            <span className='flex size-8 shrink-0 items-center justify-center rounded-md border border-dashed text-muted-foreground'>
              <FileIcon className='size-4' />
            </span>
            <span className='flex min-w-0 flex-col'>
              <span className='truncate font-medium'>Blank</span>
              <span className='truncate text-muted-foreground'>
                Your own compose file
              </span>
            </span>
          </button>
        )}
        {templates.map((t) => (
          <button
            key={t.id}
            type='button'
            className={CHOICE}
            aria-pressed={picked.id === t.id}
            onClick={() => onPick(t)}
          >
            <ServiceIcon icon={t.icon} name={t.name} className='size-8' />
            <span className='flex min-w-0 flex-col'>
              <span className='truncate font-medium'>{t.name}</span>
              <span className='line-clamp-2 text-muted-foreground'>
                {t.description}
              </span>
            </span>
          </button>
        ))}
        {typed.length >= 2 && (
          <p className='col-span-full mt-1 text-muted-foreground'>
            {error
              ? "Docker Hub couldn't be searched"
              : images?.length === 0
                ? 'Nothing on Docker Hub by that name'
                : 'On Docker Hub'}
          </p>
        )}
        {typed.length >= 2 &&
          images?.map((image) => (
            <button
              key={image.image}
              type='button'
              className={cn(CHOICE, 'col-span-full')}
              aria-pressed={!picked.id && picked.image === image.image}
              onClick={() => onPick(blankTemplate(image.image))}
            >
              <span className='flex min-w-0 flex-1 flex-col'>
                <span className='flex items-center gap-1.5 truncate font-mono'>
                  {image.image}
                  {image.official && (
                    <BadgeCheckIcon
                      className='size-3.5 shrink-0 text-muted-foreground'
                      aria-label='Official image'
                    />
                  )}
                </span>
                {image.description && (
                  <span className='truncate text-muted-foreground'>
                    {image.description}
                  </span>
                )}
              </span>
              <span className='shrink-0 font-mono text-muted-foreground tabular-nums'>
                {image.pulls}
              </span>
            </button>
          ))}
      </ScrollFade>
    </div>
  );
}
