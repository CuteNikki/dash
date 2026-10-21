'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

/** How close to an edge counts as at it, as zoom and rounding can leave a pixel or two. */
const EDGE_SLACK_PX = 2;

/**
 * A scrolling area whose edges fade out while there's more to scroll to that
 * way, so it shows it scrolls. The fades are in the card's color, for areas
 * on a card.
 */
export function ScrollFade({
  className,
  fadeTop = 'top-0',
  children,
}: {
  /** The scrolling area's own, such as its height and overflow */
  className?: string;
  /** Where the top fade starts, such as below headings that stay put */
  fadeTop?: string;
  children: React.ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ above: false, below: false });
  // The scrollbar's width, which the fades stop short of
  const [bar, setBar] = useState(0);

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

  const fade =
    'pointer-events-none absolute left-0 h-[2lh] from-card to-transparent transition-opacity';
  return (
    <div className='relative min-h-0'>
      <div ref={scroller} onScroll={measure} className={className}>
        {children}
      </div>
      <div
        aria-hidden
        style={{ right: bar }}
        className={cn(
          fade,
          'bg-linear-to-b',
          fadeTop,
          more.above ? 'opacity-100' : 'opacity-0'
        )}
      />
      <div
        aria-hidden
        style={{ right: bar }}
        className={cn(
          fade,
          'bottom-0 bg-linear-to-t',
          more.below ? 'opacity-100' : 'opacity-0'
        )}
      />
    </div>
  );
}
