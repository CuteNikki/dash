import { SERVER_NAME } from '@/lib/site';
import { cn } from '@/lib/utils';

/** The icon, "Dashboard" and the server's name, as the dashboard's heading and above the sign-in. */
export function Brand({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        'flex items-center gap-2 text-base font-semibold tracking-tight whitespace-nowrap',
        className
      )}
    >
      <BrandIcon className='size-6 shrink-0' />
      Dashboard
      {SERVER_NAME && (
        <span className='flex items-center gap-2 font-normal text-muted-foreground'>
          <span aria-hidden>·</span>
          {SERVER_NAME}
        </span>
      )}
    </span>
  );
}

/**
 * The icon in app/icon.svg, drawn here in the theme's own colours so it
 * follows the dashboard's theme button, where the file can only follow the device's.
 */
function BrandIcon({ className }: { className?: string }) {
  return (
    <svg viewBox='0 0 64 64' aria-hidden className={className}>
      <rect
        x='5'
        y='5'
        width='25'
        height='25'
        rx='7'
        className='fill-foreground'
      />
      <rect
        x='34'
        y='5'
        width='25'
        height='25'
        rx='7'
        className='fill-muted-foreground'
      />
      <rect
        x='5'
        y='34'
        width='25'
        height='25'
        rx='7'
        className='fill-muted-foreground'
      />
      <circle cx='46.5' cy='46.5' r='11' className='fill-success' />
    </svg>
  );
}
