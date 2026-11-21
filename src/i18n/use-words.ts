'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import { formatAmount, isAmount } from '@/i18n/amount';
import { useFormat } from '@/i18n/use-format';

import type {
  DetailCell,
  DetailKey,
  DetailText,
  StatKey,
  WidgetStat,
} from '@/lib/types';

type Values = Record<string, string | number>;

/**
 * An app's words, its chips' and its window's, from the keys it sends, each
 * in the page's language. The keys are checked against English where the
 * app names them, and each language's arguments against English's by the
 * messages test, so they're taken as they come here.
 */
export function useWords() {
  const f = useFormat();
  const stats = useTranslations('stats');
  const details = useTranslations('details');
  return useMemo(() => {
    const stat = stats as unknown as (key: StatKey, values: Values) => string;
    const detail = details as unknown as (
      key: DetailKey,
      values?: Values
    ) => string;
    const text = ({ text, values }: DetailText) =>
      detail(
        text,
        values &&
          Object.fromEntries(
            Object.entries(values).map(([name, value]) => [
              name,
              isAmount(value) ? formatAmount(value, f) : value,
            ])
          )
      );
    return {
      f,
      /**
       * A chip's label, plural by how many it counts; with no count, in the
       * plural, as "1 / 20 players" reads, Infinity being "other" in every
       * language's plural rules
       */
      label: (key: StatKey, count?: number) =>
        stat(key, { count: count ?? Infinity }),
      /** A chip's value: text as it is, a number, or words of its own */
      value: (value: WidgetStat['value']) =>
        typeof value === 'string'
          ? value
          : 'says' in value
            ? stat(value.says, { count: Infinity })
            : formatAmount(value, f),
      /** A title, column or label in an app's window */
      detail: (key: DetailKey) => detail(key),
      /** A cell as words, or none for a progress bar, which draws its own */
      cell(cell: DetailCell): string | undefined {
        if (typeof cell === 'string') return cell;
        if (isAmount(cell)) return formatAmount(cell, f);
        if ('text' in cell) return text(cell);
        if ('at' in cell) return f.moment(cell.at);
        return undefined;
      },
    };
  }, [f, stats, details]);
}

export type Words = ReturnType<typeof useWords>;

/** How many a chip counts, for its label's plural: its count, or its number. */
export function countOf(stat: WidgetStat) {
  return (
    stat.count ??
    (typeof stat.value === 'object' && 'number' in stat.value
      ? stat.value.number
      : undefined)
  );
}
