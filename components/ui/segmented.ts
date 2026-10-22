/**
 * One look for picking one of a few, shared by tabs and segmented toggle
 * groups: the options in one track, as tall as a button beside it, the
 * picked one raised in a surface of its own. A small one (data-size=sm) fits
 * a 24px row, such as a stat card's heading.
 */

/** The track: its border and padding leave 22px for the segments, or 18px. */
export const segmentTrack =
  'inline-flex h-7 w-fit items-center rounded-lg border border-border bg-muted p-0.5 data-[size=sm]:h-6 data-[size=sm]:rounded-md';

/** A segment, quiet until picked: a tab when active, a toggle when on. */
export const segment =
  'inline-flex h-[22px] min-w-[22px] items-center justify-center gap-1.5 rounded-[calc(var(--radius-lg)-3px)] border border-transparent px-2 text-xs font-medium whitespace-nowrap text-foreground/60 transition-all hover:text-foreground data-[size=sm]:h-[18px] data-[size=sm]:min-w-[18px] data-[size=sm]:rounded-[calc(var(--radius-md)-3px)] data-[size=sm]:text-[0.625rem] dark:text-muted-foreground dark:hover:text-foreground data-active:bg-surface data-active:text-foreground data-[state=on]:bg-surface data-[state=on]:text-foreground dark:data-active:bg-foreground/10 dark:data-active:text-foreground dark:data-[state=on]:bg-foreground/10 dark:data-[state=on]:text-foreground';
