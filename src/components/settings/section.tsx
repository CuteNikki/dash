import { cn } from '@/lib/utils';

/**
 * Settings' one shape, the same on every tab: a section's title and what
 * it's for above a card, and in the card, rows parted by lines.
 */
export function SettingsSection({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  /** Beside the title, as Invite someone is */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className='flex min-w-0 flex-col gap-2'>
      {/* Its button beside it where there's room, else under it */}
      <div className='flex flex-wrap items-end gap-x-3 gap-y-2'>
        <div className='flex min-w-0 flex-1 flex-col'>
          <h3 className='font-medium'>{title}</h3>
          {description && (
            <p className='text-muted-foreground'>{description}</p>
          )}
        </div>
        {action}
      </div>
      {/* Outlined by a border, inside it, not a ring outside it, which the
          window's scrolling would cut off */}
      <div className='flex min-w-0 flex-col divide-y divide-foreground/10 overflow-hidden rounded-lg border border-foreground/10 bg-muted dark:bg-muted/40'>
        {children}
      </div>
    </section>
  );
}

/**
 * One setting: what it is and a word on it at the left, its control at the
 * right; on a phone, the control under them, as wide as the row.
 */
export function SettingsRow({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: React.ReactNode;
  /** The control's id, so the label focuses it */
  htmlFor?: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className='flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:gap-6'>
      <div className='flex min-w-0 flex-1 flex-col gap-0.5'>
        <label htmlFor={htmlFor} className='font-medium'>
          {label}
        </label>
        {hint && <div className='text-muted-foreground'>{hint}</div>}
      </div>
      {/* As wide as a field needs, a switch or a menu as wide as itself */}
      <div className='flex shrink-0 sm:w-72 sm:justify-end'>{children}</div>
    </div>
  );
}

/** A row of a list in a card: a person, a passkey, a session. */
export function SettingsItem({
  className,
  children,
  ...props
}: React.ComponentProps<'div'>) {
  return (
    <div
      className={cn('flex min-w-0 items-center gap-3 p-3', className)}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * A card's last row: what's done with what's above, its buttons at the
 * right, and anything to say first at the left.
 */
export function SettingsFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className='flex flex-wrap items-center justify-end gap-x-4 gap-y-2 bg-foreground/2 p-3'>
      {children}
    </div>
  );
}
