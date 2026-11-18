import { describe, expect, test } from 'bun:test';

import { isStale } from '@/lib/recent';

import { pauses } from '@/components/charts/history-chart';

const S = 1000;
const MIN = 60 * S;

describe('isStale', () => {
  const now = 100 * MIN;
  test('with no readings, as after a restart', () => {
    expect(isStale(undefined, now)).toBe(true);
    expect(isStale({ at: [] }, now)).toBe(true);
  });
  test('once readings stopped for over a minute', () => {
    expect(isStale({ at: [now - 2 * MIN] }, now)).toBe(true);
  });
  test('not while they keep coming', () => {
    expect(isStale({ at: [now - 5 * MIN, now - 5 * S] }, now)).toBe(false);
  });
});

describe('pauses', () => {
  test('none in minutes from the record followed by live seconds', () => {
    const recorded = [0, 1, 2, 3].map((m) => m * MIN);
    const live = [3 * MIN + 40 * S, 3 * MIN + 45 * S, 3 * MIN + 50 * S];
    expect(pauses([...recorded, ...live]).size).toBe(0);
  });
  test('where live readings stopped for a while', () => {
    expect([...pauses([0, 5 * S, 10 * S, 5 * MIN, 5 * MIN + 5 * S])]).toEqual([
      3,
    ]);
  });
  test('one right after the first reading', () => {
    expect([
      ...pauses([0, 5 * MIN, 5 * MIN + 5 * S, 5 * MIN + 10 * S]),
    ]).toEqual([1]);
  });
  test('two in a row', () => {
    expect([
      ...pauses([0, 5 * S, 10 * S, 5 * MIN, 10 * MIN, 10 * MIN + 5 * S]),
    ]).toEqual([3, 4]);
  });
});
