/** A fitted scale spans at least this share of its highest reading */
const FIT_LEAST_SPAN = 0.1;

/**
 * A scale fitted to readings rather than from nothing, to show their shape:
 * as wide as they spread, but at least a share of the highest, so a wobble
 * of a few bytes stays a wobble, with `headroom` times that room, half above
 * and half below, and never below nothing.
 */
export function fitRange(readings: number[], headroom: number) {
  const highest = Math.max(...readings);
  const lowest = Math.min(...readings);
  const fitted = Math.max(highest - lowest, highest * FIT_LEAST_SPAN);
  const middle = (highest + lowest) / 2;
  const bottom = Math.max(0, middle - (fitted * headroom) / 2);
  return { bottom, top: bottom + fitted * headroom };
}
