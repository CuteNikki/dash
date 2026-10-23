import type { Service } from '@/lib/types';

/** Where services without a group go, shown last. */
export const DEFAULT_GROUP = 'Other';

export type ServiceGroup = { name: string; services: Service[] };

function byPositionThenName(a: Service, b: Service) {
  if (a.position != null && b.position != null) return a.position - b.position;
  if (a.position != null) return -1;
  if (b.position != null) return 1;
  return a.name.localeCompare(b.name);
}

/**
 * Services in their groups: placed groups first in their order, then the
 * rest by name, with "Other" last unless it's been placed.
 */
export function groupServices(
  services: Service[],
  order: string[] = []
): ServiceGroup[] {
  const groups = new Map<string, Service[]>();
  for (const service of services) {
    groups.set(service.group, [...(groups.get(service.group) ?? []), service]);
  }
  const rank = (name: string) => {
    const placed = order.indexOf(name);
    if (placed >= 0) return placed;
    return name === DEFAULT_GROUP ? Infinity : order.length;
  };
  return [...groups]
    .map(([name, list]) => ({
      name,
      services: list.toSorted(byPositionThenName),
    }))
    .sort(
      (a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name)
    );
}

/** Every group name in use, for picking one. */
export function groupNames(services: Service[], order: string[] = []) {
  return groupServices(services, order).map((g) => g.name);
}
