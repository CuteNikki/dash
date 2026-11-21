import type { Format } from '@/i18n/format';

import type { Amount } from '@/lib/types';

/** Whether a value is a number for the page to write, rather than words or text as it is. */
export function isAmount(value: unknown): value is Amount {
  return (
    typeof value === 'object' &&
    value !== null &&
    ['number', 'fixed', 'bytes', 'rate', 'ms', 'seconds'].some((key) =>
      Object.hasOwn(value, key)
    )
  );
}

/** A number as the page's language writes it: "1,026", "8.3 Mb/s", "59 MB", "2 days 16 h". */
export function formatAmount(amount: Amount, f: Format) {
  if ('number' in amount) return f.fixed(amount.number);
  if ('fixed' in amount) {
    const value = f.fixed(amount.fixed, amount.digits);
    return amount.unit ? `${value} ${amount.unit}` : value;
  }
  if ('bytes' in amount) return f.bytes(amount.bytes);
  if ('rate' in amount) return f.rate(amount.rate);
  if ('ms' in amount) return f.ms(amount.ms);
  return f.duration(amount.seconds);
}
