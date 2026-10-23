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
  format: (value: number) => string;
  /**
   * The least the top of a chart's scale goes to. Changes below it are too
   * small to matter, so a line of them stays low instead of filling the
   * chart, as going from 0% to 2% of a CPU would.
   */
  floor: number;
};

const KB = 1024;
const MB = 1024 * KB;

export const MEASURES = {
  /** A tenth of a core */
  cpu: { format: formatCpu, floor: 10 },
  /**
   * The server's CPU, a share of all of it: idling at a few percent, it fills
   * a third of the chart, so a few more is a ripple rather than a spike, and
   * still shows
   */
  serverCpu: { format: formatCpu, floor: 25 },
  memory: { format: formatBytes, floor: 64 * MB },
  /** A page that takes a second is slow; one that takes a tenth isn't worth a line */
  response: { format: formatMs, floor: 1000 },
  /** About what an idle server sends and receives anyway */
  network: { format: formatRate, floor: 128 * KB },
  /** Above the logs and databases an idle server writes anyway */
  disk: { format: formatRate, floor: MB },
  /**
   * How long the disk takes per read or write: a few milliseconds is usual,
   * and a stall of tens of them, as froze the Minecraft server, stands out
   */
  diskWait: { format: formatMs, floor: 20 },
  /** Processes waiting for the CPU: below one, nothing waits */
  load: { format: (load: number) => load.toFixed(2), floor: 1 },
} satisfies Record<string, Measure>;

/** A moment either side of now: "5 min ago" once it's passed, "Fri 21:00" while it's to come. */
export function formatMoment(at: number) {
  return at < Date.now() ? formatAgo(at) : formatWhen(at);
}
