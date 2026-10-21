import type { ContainerState } from '@/lib/docker';

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
