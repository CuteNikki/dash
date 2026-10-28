'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

/** How close to an edge counts as at it, as zoom and rounding can leave a pixel or two. */
const EDGE_SLACK_PX = 2;

/**
 * Room kept at the right edge for a scrollbar drawn over the list, as an
 * iPhone's is, which takes no width of its own to measure.
 */
const OVERLAY_BAR_PX = 6;

/**
 * A scrolling area whose edges fade out while there's more to scroll to that
 * way, so it shows it scrolls. The fades are in the color of what's behind
 * it: the card's, unless told otherwise.
 */
export function ScrollFade({
  className,
  fadeFrom = 'from-card',
  fill,
  shrink,
  ref,
  onScrollAction,
  children,
}: {
  /** The scrolling area's own, such as its height and overflow */
  className?: string;
  /** The color behind it, which the fades are in, as a gradient's from- class */
  fadeFrom?: string;
  /**
   * Fills its parent's height and scrolls within it, rather than being as
   * tall as its own height says, which a parent that sizes it needs
   */
  fill?: boolean;
  /**
   * Gives way in a column that's short of room, scrolling within less than
   * its own height, rather than pushing what's after it down
   */
  shrink?: boolean;
  /** The scrolling area itself, for one that also scrolls it */
  ref?: React.RefObject<HTMLDivElement | null>;
  onScrollAction?: (e: React.UIEvent<HTMLDivElement>) => void;
  children: React.ReactNode;
}) {
  const own = useRef<HTMLDivElement>(null);
  const scroller = ref ?? own;
  const [more, setMore] = useState({ above: false, below: false });
  // The scrollbar's width, which the fades stop short of; one drawn over the
  // list measures nothing, so they keep its room regardless
  const [bar, setBar] = useState(0);
  // Likewise the sideways scrollbar's height, which the bottom fade stops
  // short of while the area scrolls sideways; when it doesn't, the fade
  // overlaps the bottom edge as the top one does
  const [sideBar, setSideBar] = useState<number>();

  function measure() {
    const el = scroller.current;
    if (!el) return;
    const above = el.scrollTop > EDGE_SLACK_PX;
    const below =
      el.scrollHeight - el.clientHeight - el.scrollTop > EDGE_SLACK_PX;
    setMore((m) =>
      m.above === above && m.below === below ? m : { above, below }
    );
    setBar(el.offsetWidth - el.clientWidth);
    setSideBar(
      el.scrollWidth - el.clientWidth > EDGE_SLACK_PX
        ? Math.max(el.offsetHeight - el.clientHeight, OVERLAY_BAR_PX)
        : undefined
    );
  }

  // Again whenever the area or what's in it changes size, as when a filter
  // leaves less to show
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const observer = new ResizeObserver(() => measure());
    observer.observe(el);
    for (const child of el.children) observer.observe(child);
    return () => observer.disconnect();
  });

  // Each a little past its edge of the area, over what's next to it in the
  // same color, as an iPhone can round the two to different pixels and leave
  // the area's outermost line of pixels bare beyond the fade
  const fade =
    'pointer-events-none absolute left-0 h-[2lh] to-transparent transition-opacity';
  // Short of the scrollbar, and of room for one drawn over the area; but
  // while lines scroll sideways, text runs under that room, so they fade
  // all the way to a scrollbar that takes room of its own
  const right = sideBar === undefined ? Math.max(bar, OVERLAY_BAR_PX) : bar;
  return (
    <div
      className={cn(
        'relative min-h-0',
        fill && 'h-full',
        shrink && 'flex flex-col'
      )}
    >
      <div
        ref={scroller}
        onScroll={(e) => {
          measure();
          onScrollAction?.(e);
        }}
        // Reached by Tab while there's more to scroll to, so the keys scroll
        // it, as a mouse's wheel does
        tabIndex={more.above || more.below ? 0 : undefined}
        className={className}
      >
        {children}
      </div>
      <div
        aria-hidden
        style={{ right }}
        className={cn(
          fade,
          fadeFrom,
          '-top-0.5 bg-linear-to-b',
          more.above ? 'opacity-100' : 'opacity-0'
        )}
      />
      <div
        aria-hidden
        style={{ right, bottom: sideBar }}
        className={cn(
          fade,
          fadeFrom,
          '-bottom-0.5 bg-linear-to-t',
          more.below ? 'opacity-100' : 'opacity-0'
        )}
      />
    </div>
  );
}
