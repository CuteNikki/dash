import { cn } from '@/lib/utils';

/**
 * How many things a header button stands for: beside its label, or on a
 * phone, where the header's line is short, as a badge on the icon's
 * corner, so the button stays an icon's width however many there are.
 * Its button needs `relative`.
 */
export function ButtonCount({
  count,
  tone,
}: {
  count: number;
  /** The button's own color, which the badge is filled with */
  tone: 'update' | 'destructive';
}) {
  return (
    <span
      className={cn(
        'font-mono tabular-nums',
        'max-sm:absolute max-sm:-top-1.5 max-sm:-right-1.5 max-sm:flex max-sm:h-4 max-sm:min-w-4 max-sm:items-center max-sm:justify-center max-sm:rounded-full max-sm:px-1 max-sm:text-2xs max-sm:font-medium max-sm:text-background max-sm:ring-2 max-sm:ring-background',
        tone === 'update' ? 'max-sm:bg-update' : 'max-sm:bg-destructive'
      )}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}
