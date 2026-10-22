/**
 * Version tags: "2.11.7", "v0.16.26", "1.7.4-apache". A tag with at least
 * two numbers is a version, fixed to one release; one with fewer, such as
 * "latest" or "16-alpine", moves to each new release itself.
 */
type Version = {
  /** What comes before the numbers, as "v" */
  prefix: string;
  numbers: number[];
  /** What comes after, as "-apache" */
  suffix: string;
};

const VERSION = /^([a-z]*)(\d+(?:\.\d+)+)(.*)$/i;

export function parseVersion(tag: string): Version | undefined {
  const match = tag.match(VERSION);
  if (!match) return undefined;
  const [, prefix, numbers, suffix] = match;
  return { prefix, numbers: numbers.split('.').map(Number), suffix };
}

function compare(a: number[], b: number[]) {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

/**
 * The newest release after a version tag, among tags of its kind: the same
 * prefix and suffix and as many numbers, so "1.7.4-apache" only moves to
 * another "-apache", never to "1.8.0-fpm" or a "1.8.0-rc1". Whether it's a
 * new major version, which may need more than an update: the first number
 * that isn't a zero, as 0.16 to 0.17 is as big a step as 1 to 2.
 */
export function newerVersion(current: string, tags: string[]) {
  const from = parseVersion(current);
  if (!from) return undefined;
  let best: { tag: string; version: Version } | undefined;
  for (const tag of tags) {
    const v = parseVersion(tag);
    if (
      !v ||
      v.prefix !== from.prefix ||
      v.suffix !== from.suffix ||
      v.numbers.length !== from.numbers.length ||
      compare(v.numbers, from.numbers) <= 0
    ) {
      continue;
    }
    if (!best || compare(v.numbers, best.version.numbers) > 0) {
      best = { tag, version: v };
    }
  }
  if (!best) return undefined;
  const lead = from.numbers.findIndex((n) => n !== 0);
  const major = from.numbers
    .slice(0, lead + 1)
    .some((n, i) => best.version.numbers[i] !== n);
  return { tag: best.tag, major };
}
