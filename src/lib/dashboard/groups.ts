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

/** A group's heading among the list's rows, apart from the services' keys. */
export const HEADING = 'heading:';

/** The list's rows as dragged among: each group's heading, then its services. */
export function listRows(groups: ServiceGroup[]) {
  return groups.flatMap((g) => [
    HEADING + g.name,
    ...g.services.map((s) => s.key),
  ]);
}

/**
 * The rows with one moved to another's place, or a heading's: from below,
 * it goes last in the group above; from above, first in the heading's own.
 * Above the first heading, it's first in that group.
 */
export function moveRow(rows: string[], row: string, on: string) {
  const next = rows.filter((r) => r !== row);
  next.splice(rows.indexOf(on), 0, row);
  if (!next[0].startsWith(HEADING)) next.splice(1, 0, next.shift()!);
  return next;
}

/** Each group's services, by the headings above them. */
export function groupsOf(rows: string[]) {
  const byGroup = new Map<string, string[]>();
  let group = '';
  for (const id of rows) {
    if (id.startsWith(HEADING)) {
      group = id.slice(HEADING.length);
      byGroup.set(group, []);
    } else byGroup.get(group)!.push(id);
  }
  return byGroup;
}

/** Each group's services once a row's been dropped on another, or on a heading. */
export function dropRow(rows: string[], row: string, on: string) {
  return groupsOf(moveRow(rows, row, on));
}
