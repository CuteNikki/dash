import type { Format } from '@/i18n/format';

const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

/** 1536 → "1.5 KB", in powers of 1024 as Docker and the kernel count. */
export function formatBytes(bytes: number) {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
    value /= 1024;
    unit++;
  }
  const digits = value < 10 && unit > 0 ? 1 : 0;
  return `${value.toFixed(digits)} ${BYTE_UNITS[unit]}`;
}

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** A length of time in its two largest units, e.g. 231946 s → "2 days 16 h". */
export function formatDuration(seconds: number) {
  const days = Math.floor(seconds / DAY);
  const hours = Math.floor((seconds % DAY) / HOUR);
  const minutes = Math.floor((seconds % HOUR) / MINUTE);
  if (days > 0) return `${days} ${days === 1 ? 'day' : 'days'} ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

/** How long ago a moment was, in the largest unit that fits: "5 min ago", "3 days ago". */
export function formatAgo(at: number) {
  const seconds = (Date.now() - at) / 1000;
  const units: [string, number][] = [
    ['year', 365 * DAY],
    ['month', 30 * DAY],
    ['day', DAY],
    ['h', HOUR],
    ['min', MINUTE],
  ];
  for (const [unit, size] of units) {
    const n = Math.floor(seconds / size);
    if (n >= 1) {
      const name = unit.length > 3 && n !== 1 ? `${unit}s` : unit;
      return `${n} ${name} ago`;
    }
  }
  return 'just now';
}

/** Bytes per second, e.g. 31232 → "30 KB/s". */
export function formatRate(bytesPerSecond: number) {
  return `${formatBytes(bytesPerSecond)}/s`;
}

/** A share of something, e.g. 0.62 → "62%". */
export function formatShare(part: number, whole: number) {
  return `${whole > 0 ? Math.round((part / whole) * 100) : 0}%`;
}

/** A wait: "140 ms", or "1.2 s" past a second. */
export function formatMs(ms: number) {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(1)} s`;
}

/** Percent of one core, e.g. 0.4 → "0.4%", 182 → "182%". */
export function formatCpu(percent: number) {
  return `${percent < 10 ? percent.toFixed(1) : Math.round(percent)}%`;
}

const SCHEME = /^https?:\/\//i;

/**
 * A processor's name as the system gives it, without its trademarks,
 * generation, clock speed and core count, so its model shows:
 * "13th Gen Intel(R) Core(TM) i5-13500" → "Intel Core i5-13500".
 */
export function processorName(model: string) {
  const short = model
    .replace(/\((R|TM)\)|[®™]/gi, '')
    .replace(/^\s*\d+(st|nd|rd|th) Gen\s+/i, '')
    .replace(/\s+@\s*[\d.]+\s*GHz/i, '')
    .replace(/\s+\d+-Core Processor$/i, '')
    .replace(/\s+(Processor|with Radeon.*Graphics)$/i, '')
    // "CPU" before a model number, as in Intel's "Xeon(R) CPU E5-2680"
    .replace(/\s+CPU\s+(?=[A-Z0-9])/, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return short || model;
}

/** What an image is, without its registry, owner or tag: "lscr.io/linuxserver/sonarr:latest" → "sonarr". */
export function imageName(image: string) {
  return image.split('/').pop()?.split(/[:@]/)[0] ?? image;
}

/** Midnight before a moment, in the viewer's own time. */
function dayOf(date: Date) {
  return new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate()
  ).getTime();
}

/** A moment to come, in the viewer's own time: "today 21:00", "Fri 21:00", "3 Nov". */
export function formatWhen(at: number) {
  const date = new Date(at);
  const time = date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  const days = Math.round((dayOf(date) - dayOf(new Date())) / (DAY * 1000));
  if (days === 0) return `today ${time}`;
  if (days === 1) return `tomorrow ${time}`;
  if (days > 1 && days < 7) {
    return `${date.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
  }
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * A label before an address, saying what it's for: "Java: mc.example.com:25565".
 * A space after the colon makes it one, so a host and port never is.
 */
const LABELLED = /^([^\s:/][^:/]{0,23}):\s+(\S.*)$/;

/** An address as written, split into what it's for, if it says, and the address itself. */
export function splitAddress(entry: string): {
  label?: string;
  address: string;
} {
  const match = entry.match(LABELLED);
  return match
    ? { label: match[1].trim(), address: match[2].trim() }
    : { address: entry };
}

/** Whether an address is a web link, rather than text like a host and port. */
export function isLink(entry: string) {
  return SCHEME.test(splitAddress(entry).address);
}

/** An address as a tile shows it, without its label: a link without its scheme, the rest as it is. */
export function formatAddress(entry: string) {
  const { address } = splitAddress(entry);
  return SCHEME.test(address)
    ? address.replace(SCHEME, '').replace(/\/$/, '')
    : address;
}

/** A kind of reading: how it's written, and how far a chart of it zooms in. */
export type Measure = {
  /** In the page's language, by its useFormat() */
  format: (value: number, f: Format) => string;
  /**
   * The least the top of a chart's scale goes to. Changes below it are too
   * small to matter, so a line of them stays low instead of filling the
   * chart, as going from 0% to 2% of a CPU would.
   */
  floor: number;
};

const KB = 1024;
const MB = 1024 * KB;

const cpu = (value: number, f: Format) => f.cpu(value);
const bytes = (value: number, f: Format) => f.bytes(value);
const ms = (value: number, f: Format) => f.ms(value);
const rate = (value: number, f: Format) => f.rate(value);

export const MEASURES = {
  /** A hundredth of a core: a quiet one's line still has its shape */
  cpu: { format: cpu, floor: 1 },
  /** The server's CPU, a share of all of it: a few percent fills the chart, so its shape shows */
  serverCpu: { format: cpu, floor: 5 },
  /** A few percent is already worth seeing, where the CPU's own scale would flatten it */
  steal: { format: cpu, floor: 5 },
  memory: { format: bytes, floor: 64 * MB },
  /** A page that takes a second is slow; one that takes a tenth isn't worth a line */
  response: { format: ms, floor: 1000 },
  /** Low, so a server's few KB a second still has its shape, a trickle below it staying low */
  network: { format: rate, floor: 4 * KB },
  /** Low, so the logs and databases a quiet server writes still have their shape */
  disk: { format: rate, floor: 16 * KB },
  /**
   * How long the disk takes per read or write: a few milliseconds is usual,
   * and a stall of tens of them, as froze the Minecraft server, stands out
   */
  diskWait: { format: ms, floor: 20 },
  /** Processes waiting for the CPU: below one, nothing waits */
  load: { format: (load, f) => f.fixed(load, 2), floor: 1 },
} satisfies Record<string, Measure>;

/** A moment either side of now: "5 min ago" once it's passed, "Fri 21:00" while it's to come. */
export function formatMoment(at: number) {
  return at < Date.now() ? formatAgo(at) : formatWhen(at);
}

/**
 * A moment gone by, in the viewer's own time, with the day it was:
 * "today 03:10", "yesterday 03:10", "Mon 03:10", "12 Oct 03:10".
 */
export function formatPast(at: number) {
  const date = new Date(at);
  const time = date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
  const days = Math.round((dayOf(new Date()) - dayOf(date)) / (DAY * 1000));
  if (days === 0) return `today ${time}`;
  if (days === 1) return `yesterday ${time}`;
  if (days > 1 && days < 7) {
    return `${date.toLocaleDateString(undefined, { weekday: 'short' })} ${time}`;
  }
  return `${date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} ${time}`;
}

/**
 * A share of checks answered, as uptime is written: "100%" only when every
 * one was, else cut down rather than rounded up, so a minute down in a
 * month is "99.97%", never "100%".
 */
export function formatUptime(share: number) {
  if (share >= 1) return '100%';
  return `${(Math.floor(share * 10_000) / 100).toFixed(2)}%`;
}
