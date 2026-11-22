'use client';

import { useTranslations } from 'next-intl';
import useSWR from 'swr';

import { useFormat } from '@/i18n/use-format';

import { fetcher } from '@/lib/fetcher';
import type { ServiceStorage } from '@/lib/types';

import { TextSkeleton } from '@/components/common/skeletons';
import { useKeptShape } from '@/components/common/use-kept';
import { Breakable, Panel } from '@/components/service/app-details';

/** As long as the server keeps a folder's size measured for a service */
const REFRESH_MS = 10 * 60_000;

/**
 * What a container keeps on the server's disk: in all, and each folder it
 * mounts or volume it uses, biggest first, with where it is inside it.
 */
export function StoragePanel({
  containerId,
  className,
}: {
  containerId: string;
  className?: string;
}) {
  const t = useTranslations('service');
  const format = useFormat();
  const { data, error } = useSWR<ServiceStorage>(
    `/api/containers/${containerId}/storage`,
    fetcher,
    { refreshInterval: REFRESH_MS }
  );
  // While it's measured, as many rows as it had last time
  const rows = useKeptShape(`storage:${containerId}`, data?.folders.length, 1);

  if (error && !data) {
    return (
      <Panel title={t('storage')} className={className}>
        <span className='text-muted-foreground'>
          {t('storageFailed', { error: error.message })}
        </span>
      </Panel>
    );
  }
  return (
    <Panel title={t('storage')} className={className}>
      <span className='flex items-baseline justify-between gap-2'>
        <span className='font-mono text-lg tabular-nums'>
          {data ? format.bytes(data.total) : <TextSkeleton className='w-16' />}
        </span>
        {data?.measuredAt !== undefined && (
          <span className='text-muted-foreground'>
            {t('storageMeasured', { ago: format.ago(data.measuredAt) })}
          </span>
        )}
      </span>
      {data && !data.folders.length ? (
        <span className='text-muted-foreground'>{t('storageNone')}</span>
      ) : (
        <ul className='flex flex-col gap-2'>
          {(data?.folders ?? Array.from({ length: rows }, () => undefined)).map(
            (folder, i) => (
              <li
                key={folder?.source ?? i}
                className='flex items-start justify-between gap-3'
              >
                <div className='flex min-w-0 flex-col'>
                  {folder ? (
                    <>
                      <span className='font-mono wrap-break-word'>
                        <Breakable text={folder.source} />
                      </span>
                      <span className='wrap-break-word text-muted-foreground'>
                        {t('storageAt', { path: folder.destination })}
                      </span>
                    </>
                  ) : (
                    <>
                      <TextSkeleton className='w-48 max-w-full' />
                      <TextSkeleton className='w-24' />
                    </>
                  )}
                </div>
                <span className='font-mono whitespace-nowrap tabular-nums'>
                  {folder ? (
                    format.bytes(folder.size)
                  ) : (
                    <TextSkeleton className='w-12' />
                  )}
                </span>
              </li>
            )
          )}
        </ul>
      )}
    </Panel>
  );
}
