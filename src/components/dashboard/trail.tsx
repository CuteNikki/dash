'use client';

import { useTranslations } from 'next-intl';
import { Fragment } from 'react';

import { ArrowLeftIcon, ChevronRightIcon } from 'lucide-react';

/**
 * Where a view is, under the dashboard's header: back to the whole board,
 * then each step down to it. The same in every view, so going between them
 * only changes its last steps.
 */
export function Trail({
  steps,
  onDashboardAction,
}: {
  /** After the dashboard: each one a link but the last, which is where it is */
  steps: { label: string; title?: string; onClick?: () => void }[];
  /** Back to the whole board */
  onDashboardAction: () => void;
}) {
  const t = useTranslations('dashboard');
  const link =
    'block max-w-full truncate rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring';
  return (
    <nav aria-label={t('whereItIs')}>
      <ol className='flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground'>
        <li className='shrink-0'>
          <button
            type='button'
            onClick={onDashboardAction}
            className='flex items-center gap-1.5 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring'
          >
            <ArrowLeftIcon className='size-4' />
            {t('title')}
          </button>
        </li>
        {steps.map((step, i) => {
          const last = i === steps.length - 1;
          return (
            <Fragment key={step.label}>
              <li aria-hidden>
                <ChevronRightIcon className='size-3.5' />
              </li>
              {last ? (
                <li
                  aria-current='page'
                  className='min-w-0 truncate text-foreground'
                >
                  {step.label}
                </li>
              ) : (
                <li className='min-w-0'>
                  <button
                    type='button'
                    onClick={step.onClick}
                    title={step.title}
                    className={link}
                  >
                    {step.label}
                  </button>
                </li>
              )}
            </Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
