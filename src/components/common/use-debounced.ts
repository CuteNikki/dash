import { useEffect, useState } from 'react';

/** How long typing has to pause before what's typed is looked up. */
const PAUSE_MS = 300;

/**
 * The value once it's stopped changing for a moment, as when typing pauses,
 * so a lookup goes out for what's typed rather than for every key.
 */
export function useDebounced<T>(value: T, ms = PAUSE_MS) {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}
