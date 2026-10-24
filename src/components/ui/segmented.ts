/**
 * One look for picking one of a few, shared by tabs and segmented toggle
 * groups: the options in one track, as tall as a button beside it, the
 * picked one raised in a surface of its own, and in the light theme outlined
 * and shadowed too, as a white card's track is as white as that surface.
 * The track is filled, bordered
 * and rounded as an outline button is, so the two match side by side. A small
 * one (data-size=sm) fits a 24px row, such as a stat card's heading.
 */

/**
 * The track: its border and padding leave 22px for the segments, or 18px,
 * a little apart, so a picked one doesn't sit against the next.
 */
export const segmentTrack =
  'inline-flex h-7 w-fit items-center gap-0.5 rounded-md border border-border bg-field p-0.5 data-[size=sm]:h-6';

/** A segment, quiet until picked: a tab when active, a toggle when on. */
export const segment =
  'inline-flex h-5.5 min-w-5.5 items-center justify-center gap-1.5 rounded-[calc(var(--radius-md)-3px)] border border-transparent px-2.5 text-xs font-medium whitespace-nowrap text-foreground/60 transition-all hover:text-foreground data-[size=sm]:h-4.5 data-[size=sm]:min-w-4.5 data-[size=sm]:px-2 data-[size=sm]:text-2xs dark:text-muted-foreground dark:hover:text-foreground data-active:border-foreground/15 data-active:bg-surface data-active:text-foreground data-active:shadow-xs data-[state=on]:border-foreground/15 data-[state=on]:bg-surface data-[state=on]:text-foreground data-[state=on]:shadow-xs dark:data-active:border-transparent dark:data-active:bg-foreground/10 dark:data-active:text-foreground dark:data-active:shadow-none dark:data-[state=on]:border-transparent dark:data-[state=on]:bg-foreground/10 dark:data-[state=on]:text-foreground dark:data-[state=on]:shadow-none';
