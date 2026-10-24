'use client';

import { useCallback, useEffect, useState, type SetStateAction } from 'react';

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

/** Where shapes are kept across page loads: they're no secret. */
const SHAPE_PREFIX = 'dash-shape:';

/** A shape last kept, on this page or an earlier one. */
function keptShape<T>(key: string): T | undefined {
  if (kept.has(SHAPE_PREFIX + key)) return kept.get(SHAPE_PREFIX + key) as T;
  try {
    const stored = localStorage.getItem(SHAPE_PREFIX + key);
    if (stored === null) return undefined;
    const shape = JSON.parse(stored) as T;
    kept.set(SHAPE_PREFIX + key, shape);
    return shape;
  } catch {
    return undefined;
  }
}

/**
 * Keeps what something looks like now, as how many rows a list has or how
 * tall each is, measured once it's drawn. As JSON, so small and plain.
 */
export function keepShape(key: string, shape: unknown) {
  kept.set(SHAPE_PREFIX + key, shape);
  try {
    localStorage.setItem(SHAPE_PREFIX + key, JSON.stringify(shape));
  } catch {}
}

/**
 * What something looked like when last seen, for a placeholder to take the
 * same shape while it's read again: `shape` once it's known (and kept, for
 * next time), else the last one kept, else `guess`.
 */
export function useKeptShape<T>(key: string, shape: T | undefined, guess: T) {
  const json = shape === undefined ? undefined : JSON.stringify(shape);
  useEffect(() => {
    if (json !== undefined) keepShape(key, JSON.parse(json));
  }, [key, json]);
  return shape ?? keptShape<T>(key) ?? guess;
}

/** How many of something there were when last seen: a shape that's a count. */
export function useKeptCount(
  key: string,
  count: number | undefined,
  guess: number
) {
  return useKeptShape(key, count, guess);
}
