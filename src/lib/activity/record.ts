import 'server-only';

import type { ActivityAction } from '@/lib/activity/actions';
import { db } from '@/lib/db';

/** The longest a target, detail or error is kept: a line, not a whole log. */
const MAX_TEXT = 500;

const cut = (text?: string) =>
  text && text.length > MAX_TEXT ? `${text.slice(0, MAX_TEXT - 1)}…` : text;

// An error's end, where the reason usually is, as a run's ends with it
const cutStart = (text?: string) =>
  text && text.length > MAX_TEXT ? `…${text.slice(-(MAX_TEXT - 1))}` : text;

/**
 * Notes something done from the dashboard, by whoever did it. Never fails
 * what it notes: a log that couldn't be written is said in the server's log.
 */
export async function record(
  who: { user: { id: string; name: string } } | undefined,
  entry: {
    action: ActivityAction;
    target?: string;
    detail?: string;
    ok?: boolean;
    error?: string;
  }
) {
  try {
    await db.activity.create({
      data: {
        userId: who?.user.id,
        user: who?.user.name ?? 'Someone',
        action: entry.action,
        target: cut(entry.target),
        detail: cut(entry.detail),
        ok: entry.ok ?? true,
        error: cutStart(entry.ok === false ? entry.error : undefined),
      },
      select: { id: true },
    });
  } catch (error) {
    console.error("Couldn't note in the activity log:", entry, error);
  }
}

/** A thing's outcome as record takes it, from a result with ok and maybe an error. */
export function outcome(result: { ok: boolean; error?: string }) {
  return { ok: result.ok, error: result.ok ? undefined : result.error };
}

/** Does something, its failure as an error to show and note rather than thrown. */
export async function tried(
  work: () => Promise<unknown>
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await work();
    return { ok: true };
  } catch (error) {
    return { ok: false, error: (error as Error).message };
  }
}

/**
 * For streamRun's done: notes a run once it's over, as working when it
 * exited 0, else with the last error it printed.
 */
export function recordRun(
  who: { user: { id: string; name: string } } | undefined,
  entry: { action: ActivityAction; target?: string; detail?: string }
) {
  return (exitCode: number, lastError?: string) =>
    record(who, {
      ...entry,
      ok: exitCode === 0,
      error: lastError ?? `Exited with ${exitCode}`,
    });
}
