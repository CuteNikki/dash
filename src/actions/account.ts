'use server';

import { requireAccess } from '@/lib/auth/access';
import { db } from '@/lib/db';

/** Whether the monitor's alerts are mailed to whoever's signed in, for those who see the server. */
export async function setAlertMail(on: boolean): Promise<{ error?: string }> {
  const access = await requireAccess('server');
  if (typeof on !== 'boolean') return { error: 'On or off' };
  await db.user.update({
    where: { id: access.user.id },
    data: { alertMail: on },
  });
  return {};
}
