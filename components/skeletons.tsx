import { cn } from '@/lib/utils';

import { Skeleton } from '@/components/ui/skeleton';

/** Line lengths that read like text, repeated as needed: never all alike. */
const WIDTHS = [
  'w-3/4',
  'w-1/2',
  'w-5/6',
  'w-2/3',
  'w-1/3',
  'w-4/5',
  'w-3/5',
  'w-2/5',
];

/**
 * A placeholder bar, a faint tint of the text color, so it shows on the
 * muted panels it stands in for in either theme.
 */
function Bar({ className }: { className?: string }) {
  return <Skeleton className={cn('bg-foreground/10', className)} />;
}

/** Lines of code or log, in the box they'll appear in. */
export function CodeSkeleton({
  lines = 14,
  className,
}: {
  lines?: number;
  className?: string;
}) {
  return (
    <div
      aria-busy
      aria-label='Loading'
      className={cn(
        'flex h-full flex-col gap-2 rounded-lg bg-muted p-3',
        className
      )}
    >
      {Array.from({ length: lines }, (_, i) => (
        <Bar key={i} className={cn('h-3', WIDTHS[i % WIDTHS.length])} />
      ))}
    </div>
  );
}

/** Rows of a file tree: an icon and a name. */
export function TreeSkeleton({
  rows = 10,
  indent,
}: {
  rows?: number;
  /** For a folder's rows, stepped in like its entries will be */
  indent?: React.CSSProperties;
}) {
  return (
    <div aria-busy aria-label='Loading' className='flex flex-col'>
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          style={indent}
          className='flex items-center gap-1.5 py-1 pr-2 pl-1'
        >
          {/* Where a folder's arrow goes, then the icon, as in a real row */}
          <span className='size-3.5 shrink-0' />
          <Bar className='size-3.5 shrink-0' />
          <Bar className={cn('h-3', WIDTHS[(i + 3) % WIDTHS.length])} />
        </div>
      ))}
    </div>
  );
}
