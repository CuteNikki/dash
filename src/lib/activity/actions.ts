/**
 * What can be done from the dashboard, as the activity log keeps it. How
 * each reads, "Nikki stopped minecraft", is under "activity.actions" in the
 * messages, a key's dots nesting it. Shared with the browser.
 */
export const ACTIVITY_ACTIONS = [
  'start',
  'stop',
  'restart',
  'update',
  'console',
  'caddy.reload',
  'deploy',
  'service.create',
  'service.remove',
  'container.remove',
  'file.save',
  'file.create',
  'file.rename',
  'file.delete',
  'git.fetch',
  'git.pull',
  'git.push',
  'git.commit',
  'git.switch',
  'storage.delete',
  'tile.edit',
  'tile.reset',
  'tile.restore',
  'site.add',
  'site.remove',
  'group.rename',
  'process.stop',
  'docker.prune',
  'system.upgrade',
  'system.reboot',
  'backup.run',
  'backup.restore',
  'backup.folder',
  'person.access',
  'person.disable',
  'person.enable',
  'person.signout',
  'person.remove',
  'invite.create',
  'invite.revoke',
  'invite.accept',
] as const;

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

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

/** Whether this copy knows an entry's action, to say it in words. */
export const isActivityAction = (action: string): action is ActivityAction =>
  (ACTIVITY_ACTIONS as readonly string[]).includes(action);
