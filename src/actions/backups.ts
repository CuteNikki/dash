'use server';

import { posix } from 'node:path';

import { record } from '@/lib/activity/record';
import { requireAccess } from '@/lib/auth/access';
import { forgetFailure } from '@/lib/backups/backups';
import { db } from '@/lib/db';

/** Switches a part of the backups on or off, as a game server nobody plays on. */
export async function setBackupSource(
  id: string,
  enabled: boolean
): Promise<{ error?: string }> {
  await requireAccess('server');
  if (typeof id !== 'string' || typeof enabled !== 'boolean') {
    return { error: 'Which part?' };
  }
  await db.backupSource.upsert({
    where: { id },
    create: { id, enabled },
    update: { enabled },
  });
  if (!enabled) await forgetFailure(id);
  return {};
}

/** Folders that are the system's, or the backups' own, never worth backing up whole. */
const NOT_THESE =
  /^\/(proc|sys|dev|run|tmp|var\/lib\/docker|var\/lib\/dash)(\/|$)|^\/$/;

/** Adds a folder outside ~/services to the backups, as apps' settings kept in /docker/config. */
export async function addBackupFolder(
  path: string
): Promise<{ error?: string }> {
  const access = await requireAccess('server');
  const clean = posix.normalize(String(path).trim()).replace(/\/$/, '');
  if (!clean.startsWith('/')) return { error: 'Give its whole path, from /' };
  if (NOT_THESE.test(clean)) return { error: "That's not a folder to back up" };
  const id = `path:${clean}`;
  await db.backupSource.upsert({
    where: { id },
    create: { id, path: clean, enabled: true },
    update: { path: clean, enabled: true },
  });
  await record(access, { action: 'backup.folder', target: clean });
  return {};
}

/** Takes a folder added here out of the backups; its backups stay until they're pruned. */
export async function removeBackupFolder(
  id: string
): Promise<{ error?: string }> {
  await requireAccess('server');
  if (typeof id !== 'string' || !id.startsWith('path:')) {
    return { error: 'Only a folder added here can be taken out' };
  }
  await db.backupSource.deleteMany({ where: { id } });
  await forgetFailure(id);
  return {};
}
