import type { Service } from '@/lib/types';

/** Where services without a group go, shown last. */
export const DEFAULT_GROUP = 'Other';

export type ServiceGroup = { name: string; services: Service[] };

export function groupServices(services: Service[]): ServiceGroup[] {
  const groups = new Map<string, Service[]>();
  for (const service of services) {
    groups.set(service.group, [...(groups.get(service.group) ?? []), service]);
  }
  return [...groups]
    .map(([name, list]) => ({
      name,
      services: list.toSorted((a, b) => a.name.localeCompare(b.name)),
    }))
    .sort((a, b) => {
      if (a.name === DEFAULT_GROUP) return 1;
      if (b.name === DEFAULT_GROUP) return -1;
      return a.name.localeCompare(b.name);
    });
}
