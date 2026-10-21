'use client';

import { useMemo } from 'react';
import useSWR from 'swr';

import { groupServices } from '@/lib/groups';
import type { Service } from '@/lib/types';

import { ThemeButton } from '@/components/theme-button';
import { TilesView } from '@/components/tiles-view';

/** How often the dashboard asks for fresh status and usage. */
const REFRESH_MS = 5_000;

const fetcher = (url: string) =>
  fetch(url).then((res) => {
    if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
    return res.json();
  });

export function Dashboard({ initial }: { initial: Service[] }) {
  const { data: services = initial } = useSWR<Service[]>(
    '/api/services',
    fetcher,
    { fallbackData: initial, refreshInterval: REFRESH_MS }
  );
  const groups = useMemo(() => groupServices(services), [services]);

  return (
    <div className='mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-6 sm:px-6'>
      <header className='flex items-center gap-3'>
        <h1 className='mr-auto text-base font-semibold tracking-tight'>dash</h1>
        <ThemeButton />
      </header>
      <TilesView groups={groups} onOpen={() => {}} />
    </div>
  );
}
