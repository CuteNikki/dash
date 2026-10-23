/**
 * How far back a chart of the monitor's record looks, and how long each of
 * its points is: a few hundred at most, however long it covers.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export const HISTORY_RANGES = {
  '1h': { label: '1 h', words: 'the last hour', ms: HOUR, bucket: MINUTE },
  '6h': {
    label: '6 h',
    words: 'the last six hours',
    ms: 6 * HOUR,
    bucket: 2 * MINUTE,
  },
  '24h': { label: '24 h', words: 'the last day', ms: DAY, bucket: 5 * MINUTE },
  '7d': {
    label: '7 d',
    words: 'the last week',
    ms: 7 * DAY,
    bucket: 30 * MINUTE,
  },
  '30d': {
    label: '30 d',
    words: 'the last month',
    ms: 30 * DAY,
    bucket: 2 * HOUR,
  },
} as const;

export type HistoryRange = keyof typeof HISTORY_RANGES;

export const isHistoryRange = (value: unknown): value is HistoryRange =>
  typeof value === 'string' && Object.hasOwn(HISTORY_RANGES, value);
