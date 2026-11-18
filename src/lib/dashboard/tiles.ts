import type { Container } from '@/lib/docker/docker';

/** The longest a tile's description can be: a line under its name. */
export const MAX_DESCRIPTION = 120;

/** A tile that's a website elsewhere, checked over HTTP, rather than a container here. */
export const SITE_PREFIX = 'site:';

export function isSiteKey(key: string) {
  return key.startsWith(SITE_PREFIX);
}

/**
 * A container's tile key: its compose project and service, which survive the
 * container being recreated, or its name for one started on its own.
 */
export function serviceKey(c: Container) {
  return c.stack ? `${c.stack.project}/${c.stack.service}` : c.name;
}
