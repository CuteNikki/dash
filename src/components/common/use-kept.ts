'use client';

import { useCallback, useState, type SetStateAction } from 'react';

/**
 * What's been left where it was, by key, for as long as the page is open:
 * held here rather than in the component, so closing a window or switching
 * away from a tab and coming back finds it as it was. Only in memory, as
 * some of it, a file's unsaved text, can be a secret.
 */
const kept = new Map<string, unknown>();

/**
 * useState, kept under a key once the component's gone: the same key, as a
 * stack's folder, finds the value again. `override`, when given, is taken
 * over what was kept, as a window asked to open on a tab.
 */
export function useKept<T>(key: string, initial: T | (() => T), override?: T) {
  const [value, setValue] = useState<T>(() => {
    if (override !== undefined) {
      kept.set(key, override);
      return override;
    }
    if (kept.has(key)) return kept.get(key) as T;
    return typeof initial === 'function' ? (initial as () => T)() : initial;
  });
  const set = useCallback(
    (next: SetStateAction<T>) =>
      setValue((previous) => {
        const value =
          typeof next === 'function'
            ? (next as (previous: T) => T)(previous)
            : next;
        kept.set(key, value);
        return value;
      }),
    [key]
  );
  return [value, set] as const;
}

/** Everything kept under keys that start so, as every stack's edits. */
export function keptUnder<T>(prefix: string): T[] {
  return [...kept].filter(([k]) => k.startsWith(prefix)).map(([, v]) => v as T);
}
