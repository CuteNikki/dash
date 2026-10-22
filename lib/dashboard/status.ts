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

const LABELS: Record<ContainerState, string> = {
  running: 'Running',
  unhealthy: 'Unhealthy',
  starting: 'Starting',
  paused: 'Paused',
  restarting: 'Restarting',
  exited: 'Stopped',
  created: 'Created',
  dead: 'Dead',
};

export function stateLabel(state: ContainerState) {
  return LABELS[state];
}

/** What a tile's state is called: a container's, or for a website, whether it's up. */
export function labelOf(service: Service) {
  if (!service.site) return stateLabel(service.state);
  if (service.state === 'dead') return 'No address';
  const check = service.site.check;
  return !check ? 'Checking' : check.ok ? 'Up' : 'Down';
}
