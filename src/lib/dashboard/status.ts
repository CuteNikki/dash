import type { Messages } from 'next-intl';

import type { ContainerState } from '@/lib/docker/docker';
import type { Service } from '@/lib/types';

/** How a container is doing, in the three ways the dashboard shows it. */
export type Health = 'ok' | 'attention' | 'off';

export function healthOf(state: ContainerState): Health {
  if (state === 'running') return 'ok';
  if (['unhealthy', 'starting', 'restarting', 'paused'].includes(state)) {
    return 'attention';
  }
  return 'off';
}

export function isRunning(state: ContainerState) {
  return healthOf(state) !== 'off';
}

/** What a state is called: its key under "status" in the messages, a container's state being one. */
export type StatusKey = keyof Messages['status'];

/** What a tile's state is called: a container's, or for a website, whether it's online. */
export function labelOf(service: Service): StatusKey {
  if (!service.site) return service.state;
  if (service.state === 'dead') return 'noAddress';
  const check = service.site.check;
  return !check ? 'checking' : check.ok ? 'online' : 'offline';
}
