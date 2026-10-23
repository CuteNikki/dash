'use server';

import { requireAccess } from '@/lib/auth/access';
import { lookAgain } from '@/lib/host/system-updates';

/** Looks at the server's updates now, rather than when they're next due. */
export async function checkSystemUpdates(): Promise<{ error?: string }> {
  await requireAccess('server');
  try {
    await lookAgain();
    return {};
  } catch (error) {
    return { error: (error as Error).message };
  }
}
