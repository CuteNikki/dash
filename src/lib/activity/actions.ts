/**
 * What can be done from the dashboard, as the activity log keeps it, and how
 * each reads: "Nikki stopped minecraft". Shared with the browser.
 */
export const ACTIVITY_ACTIONS = {
  start: 'started',
  stop: 'stopped',
  restart: 'restarted',
  update: 'updated',
  console: 'typed into the console of',
  'caddy.reload': 'reloaded the config of',
  deploy: 'redeployed',
  'service.create': 'added the service',
  'service.remove': 'removed the service',
  'file.save': 'saved',
  'file.create': 'made',
  'file.rename': 'renamed',
  'file.delete': 'deleted',
  'git.fetch': 'fetched',
  'git.pull': 'pulled',
  'git.push': 'pushed',
  'git.commit': 'committed to',
  'git.switch': 'switched the branch of',
  'storage.delete': 'deleted files from',
  'tile.edit': 'edited the tile of',
  'tile.reset': 'reset the tile of',
  'tile.restore': 'put back the tile of',
  'site.add': 'added the website',
  'site.remove': 'removed the website',
  'group.rename': 'renamed the group',
  'process.stop': 'stopped the process',
  'docker.prune': 'freed',
  'system.upgrade': "upgraded the server's packages",
  'system.reboot': 'restarted the server',
  'backup.run': 'backed up',
  'backup.restore': 'restored',
  'person.access': 'changed what this person may do:',
  'person.disable': 'disabled',
  'person.enable': 'enabled',
  'person.signout': 'signed out',
  'person.remove': 'removed',
  'invite.create': 'invited',
  'invite.revoke': 'revoked the invite for',
  'invite.accept': 'joined from an invite, as',
} as const;

export type ActivityAction = keyof typeof ACTIVITY_ACTIONS;

/** One entry of the log, as the browser shows it. */
export type ActivityEntry = {
  id: string;
  /** Milliseconds since 1970 */
  at: number;
  user: string;
  action: string;
  target?: string;
  detail?: string;
  ok: boolean;
  error?: string;
};

/** How an entry's action reads; one this copy doesn't know, as it's written. */
export function actionWords(action: string) {
  return Object.hasOwn(ACTIVITY_ACTIONS, action)
    ? ACTIVITY_ACTIONS[action as ActivityAction]
    : action;
}
