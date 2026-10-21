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

/** Bytes per second, e.g. 31232 → "30 KB/s". */
export function formatRate(bytesPerSecond: number) {
  return `${formatBytes(bytesPerSecond)}/s`;
}

/** A share of something, e.g. 0.62 → "62%". */
export function formatShare(part: number, whole: number) {
  return `${whole > 0 ? Math.round((part / whole) * 100) : 0}%`;
}

/** Percent of one core, e.g. 0.4 → "0.4%", 182 → "182%". */
export function formatCpu(percent: number) {
  return `${percent < 10 ? percent.toFixed(1) : Math.round(percent)}%`;
}

const SCHEME = /^https?:\/\//i;

/** Whether an address is a web link, rather than text like a host and port. */
export function isLink(address: string) {
  return SCHEME.test(address);
}

/** An address as a tile shows it: a link without its scheme, the rest as it is. */
export function formatAddress(address: string) {
  return isLink(address)
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
  memory: { format: formatBytes, floor: 64 * MB },
  /** About what an idle server sends and receives anyway */
  network: { format: formatRate, floor: 128 * KB },
  /** Above the logs and databases an idle server writes anyway */
  disk: { format: formatRate, floor: MB },
} satisfies Record<string, Measure>;
