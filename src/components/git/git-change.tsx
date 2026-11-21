'use client';

import { useTranslations } from 'next-intl';

import type { GitChange } from '@/lib/git';

/** Each status's word, by its key under "git.status". */
const STATUS_KEY = {
  M: 'changed',
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  '?': 'new',
} as const satisfies Record<GitChange['status'], string>;

/** What happened to a file, as a letter, with its word on hover. */
export function ChangeStatus({ status }: { status: GitChange['status'] }) {
  const t = useTranslations('git');
  return (
    <span
      title={t(`status.${STATUS_KEY[status]}`)}
      className='w-3 shrink-0 font-mono text-muted-foreground'
    >
      {status === '?' ? 'N' : status}
    </span>
  );
}
