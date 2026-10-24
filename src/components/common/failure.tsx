'use client';

import { useLayoutEffect, useRef, useState } from 'react';

import { XCircleIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

/**
 * Why something didn't work, in red beside a cross, wrapped to two lines;
 * one longer, as Docker's often are, opens to the whole of it when it's
 * clicked.
 */
export function Failure({ children }: { children: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [cut, setCut] = useState(false);

  // Measured while it's clamped; open, it fits by definition
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    const measure = () => setCut(el.scrollHeight > el.clientHeight + 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [children, open]);

  return (
    <span className='flex items-start gap-1 text-destructive [&_svg]:mt-0.5 [&_svg]:size-3.5'>
      <XCircleIcon />
      <span className='flex min-w-0 flex-col items-start'>
        <span
          ref={ref}
          className={cn(
            'wrap-break-word whitespace-pre-wrap',
            !open && 'line-clamp-2'
          )}
        >
          {children}
        </span>
        {(cut || open) && (
          <button
            type='button'
            aria-expanded={open}
            onClick={() => setOpen(!open)}
            className='text-muted-foreground hover:text-foreground'
          >
            {open ? 'Show less' : 'Show all'}
          </button>
        )}
      </span>
    </span>
  );
}
