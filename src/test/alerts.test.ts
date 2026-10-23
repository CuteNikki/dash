import { describe, expect, test } from 'bun:test';

import { certProblem } from '@/lib/alerts/checks';

const DAY = 24 * 60 * 60_000;
const now = Date.UTC(2026, 9, 23, 12);

describe('certProblem', () => {
  test('is nothing for one with weeks left', () => {
    expect(certProblem(now + 60 * DAY, now)).toBeUndefined();
    expect(certProblem(now + 14 * DAY, now)).toBeUndefined();
  });
  test('counts the days left, rounding up', () => {
    expect(certProblem(now + 13.2 * DAY, now)).toBe(
      'Certificate runs out in 14 days'
    );
    expect(certProblem(now + 9 * DAY, now)).toBe(
      'Certificate runs out in 9 days'
    );
    expect(certProblem(now + 0.5 * DAY, now)).toBe(
      'Certificate runs out in 1 day'
    );
  });
  test('says when it has run out', () => {
    expect(certProblem(now - DAY, now)).toBe('Certificate has run out');
  });
  test('is nothing when there is no date to go by', () => {
    expect(certProblem(undefined, now)).toBeUndefined();
  });
});
