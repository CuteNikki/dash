import type { useTranslations } from 'next-intl';

import type { Locale } from '@/i18n/locales';

/** The format namespace's translator, from useTranslations('format') or getTranslations('format'). */
export type FormatTranslator = ReturnType<typeof useTranslations<'format'>>;

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/** Midnight before a moment, in the viewer's own time. */
function dayOf(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  ).getTime();
}

/**
 * Numbers, sizes, waits and moments as a language writes them: "1.5 KB" and
 * "1,5 KB", "5 min ago" and "vor 5 Min.". From useFormat() in a component,
 * getFormat() on the server.
 */
export function createFormat(locale: Locale, t: FormatTranslator) {
  const numbers = new Map<number, Intl.NumberFormat>();
  /** A number with as many decimals as asked, written as the language does */
  const fixed = (value: number, digits = 0) => {
    let format = numbers.get(digits);
    if (!format) {
      format = new Intl.NumberFormat(locale, {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
      numbers.set(digits, format);
    }
    return format.format(value);
  };
  const percents = new Map<number, Intl.NumberFormat>();
  /** 62 → "62%", or "62 %" where the language puts a space before it */
  const percent = (value: number, digits = 0) => {
    let format = percents.get(digits);
    if (!format) {
      format = new Intl.NumberFormat(locale, {
        style: 'percent',
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      });
      percents.set(digits, format);
    }
    return format.format(value / 100);
  };
  const time = (date: Date) =>
    date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  const weekday = (date: Date) =>
    date.toLocaleDateString(locale, { weekday: 'short' });
  const dayMonth = (date: Date) =>
    date.toLocaleDateString(locale, { day: 'numeric', month: 'short' });

  const format = {
    locale,
    fixed,
    percent,
    /** 1536 → "1.5 KB", in powers of 1024 as Docker and the kernel count */
    bytes(bytes: number) {
      let value = bytes;
      let unit = 0;
      while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
        value /= 1024;
        unit++;
      }
      return `${fixed(value, value < 10 && unit > 0 ? 1 : 0)} ${BYTE_UNITS[unit]}`;
    },
    /** Bytes per second: 31232 → "30 KB/s" */
    rate: (bytesPerSecond: number) => `${format.bytes(bytesPerSecond)}/s`,
    /** A share of something: 0.62 of 1 → "62%" */
    share: (part: number, whole: number) =>
      percent(whole > 0 ? Math.round((part / whole) * 100) : 0),
    /** A wait: "140 ms", or "1.2 s" past a second */
    ms: (ms: number) =>
      ms < 1000 ? `${fixed(Math.round(ms))} ms` : `${fixed(ms / 1000, 1)} s`,
    /** Percent of one core: 0.4 → "0.4%", 182 → "182%" */
    cpu: (value: number) =>
      value < 10 ? percent(value, 1) : percent(Math.round(value)),
    /**
     * A share of checks answered, as uptime is written: "100%" only when
     * every one was, else cut down rather than rounded up, so a minute down
     * in a month is "99.97%", never "100%"
     */
    uptime: (share: number) =>
      share >= 1 ? percent(100) : percent(Math.floor(share * 10_000) / 100, 2),
    /** A length of time in its two largest units: 231946 s → "2 days 16 h" */
    duration(seconds: number) {
      const days = Math.floor(seconds / DAY);
      const hours = Math.floor((seconds % DAY) / HOUR);
      const minutes = Math.floor((seconds % HOUR) / MINUTE);
      if (days > 0) return t('days', { days, hours });
      if (hours > 0) return t('hours', { hours, minutes });
      return t('minutes', { minutes });
    },
    /** How long ago a moment was, in the largest unit that fits: "5 min ago", "3 days ago" */
    ago(at: number) {
      const seconds = (Date.now() - at) / 1000;
      const units = [
        ['years', 365 * DAY],
        ['months', 30 * DAY],
        ['daysAgo', DAY],
        ['hoursAgo', HOUR],
        ['minutesAgo', MINUTE],
      ] as const;
      for (const [unit, size] of units) {
        const count = Math.floor(seconds / size);
        if (count >= 1) return t(unit, { count });
      }
      return t('justNow');
    },
    /** A moment to come, in the viewer's own time: "today 21:00", "Fri 21:00", "3 Nov" */
    when(at: number) {
      const date = new Date(at);
      const days = Math.round((dayOf(date) - dayOf(new Date())) / (DAY * 1000));
      if (days === 0) return t('today', { time: time(date) });
      if (days === 1) return t('tomorrow', { time: time(date) });
      if (days > 1 && days < 7) {
        return t('dayAt', { day: weekday(date), time: time(date) });
      }
      return dayMonth(date);
    },
    /**
     * A moment gone by, in the viewer's own time, with the day it was:
     * "today 03:10", "yesterday 03:10", "Mon 03:10", "12 Oct 03:10"
     */
    past(at: number) {
      const date = new Date(at);
      const days = Math.round((dayOf(new Date()) - dayOf(date)) / (DAY * 1000));
      if (days === 0) return t('today', { time: time(date) });
      if (days === 1) return t('yesterday', { time: time(date) });
      if (days > 1 && days < 7) {
        return t('dayAt', { day: weekday(date), time: time(date) });
      }
      return t('dayAt', { day: dayMonth(date), time: time(date) });
    },
    /** A moment either side of now: "5 min ago" once it's passed, "Fri 21:00" while it's to come */
    moment: (at: number) =>
      at < Date.now() ? format.ago(at) : format.when(at),
    /** Just the time of day: "21:00", "9:00 PM" */
    time: (at: number) => time(new Date(at)),
  };
  return format;
}

export type Format = ReturnType<typeof createFormat>;
