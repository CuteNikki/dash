'use client';

import { useState } from 'react';

import { cn } from '@/lib/utils';

/**
 * A group's name as a field, in the heading's own type and no taller, so
 * renaming it moves nothing: saved on Enter or leaving it, put back on
 * Escape or if it's left empty.
 */
export function GroupName({
  name,
  onRename,
  className,
}: {
  name: string;
  onRename: (name: string) => void;
  className?: string;
}) {
  const [value, setValue] = useState(name);
  // A rename saved, or made elsewhere, shows here
  const [shown, setShown] = useState(name);
  if (shown !== name) {
    setShown(name);
    setValue(name);
  }

  function commit() {
    const next = value.trim();
    if (next && next !== name) onRename(next);
    else setValue(name);
  }

  return (
    <input
      aria-label={`Rename ${name}`}
      value={value}
      maxLength={60}
      spellCheck={false}
      onChange={(e) => setValue(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          setValue(name);
          // Left once it's as it was, so leaving it saves nothing
          const field = e.currentTarget;
          requestAnimationFrame(() => field.blur());
        }
      }}
      className={cn(
        'field-sizing-content h-4 min-w-8 rounded-none border-b border-dashed border-foreground/30 bg-transparent p-0 leading-4 tracking-wide text-foreground uppercase outline-none hover:border-foreground/60 focus:border-solid focus:border-primary',
        className
      )}
    />
  );
}
