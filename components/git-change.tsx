import type { GitChange } from '@/lib/git';

const STATUS_LABEL: Record<GitChange['status'], string> = {
  M: 'Changed',
  A: 'Added',
  D: 'Deleted',
  R: 'Renamed',
  '?': 'New',
};

/** What happened to a file, as a letter, with its word on hover. */
export function ChangeStatus({ status }: { status: GitChange['status'] }) {
  return (
    <span
      title={STATUS_LABEL[status]}
      className='w-3 shrink-0 font-mono text-muted-foreground'
    >
      {status === '?' ? 'N' : status}
    </span>
  );
}
