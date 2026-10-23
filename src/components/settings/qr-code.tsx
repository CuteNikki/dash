'use client';

import { useMemo } from 'react';
import { encode } from 'uqr';

import { cn } from '@/lib/utils';

/**
 * Text as a QR code, drawn as squares in an SVG: each row's runs of dark
 * modules as one rectangle, so a code is a few hundred shapes, not
 * thousands. Dark on white in either theme, as a camera reads best.
 */
export function QrCode({
  value,
  label,
  className,
}: {
  value: string;
  /** What it is, for a screen reader */
  label: string;
  className?: string;
}) {
  const { size, runs } = useMemo(() => {
    // Its quiet zone is the white padding around it, not modules of its own
    const { size, data } = encode(value, { ecc: 'M', border: 0 });
    const runs: { x: number; y: number; width: number }[] = [];
    data.forEach((row, y) => {
      let start = -1;
      row.forEach((dark, x) => {
        if (dark && start < 0) start = x;
        if (start >= 0 && (!dark || x === row.length - 1)) {
          runs.push({ x: start, y, width: (dark ? x + 1 : x) - start });
          start = -1;
        }
      });
    });
    return { size, runs };
  }, [value]);

  return (
    <svg
      role='img'
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering='crispEdges'
      className={cn('rounded-md bg-white p-3', className)}
    >
      {runs.map(({ x, y, width }) => (
        <rect
          key={`${x},${y}`}
          x={x}
          y={y}
          width={width}
          height={1}
          fill='black'
        />
      ))}
    </svg>
  );
}
