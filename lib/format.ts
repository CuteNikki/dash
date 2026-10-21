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
