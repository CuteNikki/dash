import { cn } from '@/lib/utils';

/** dash's icon and name, as the dashboard's heading and above the sign-in. */
export function Brand({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'flex items-center gap-2 text-base font-semibold tracking-tight',
        className
      )}
    >
      {/* The icon the browser shows too, a small SVG of its own: nothing to optimize */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src='/icon.svg' alt='' className='size-6' />
      dash
    </span>
  );
}
