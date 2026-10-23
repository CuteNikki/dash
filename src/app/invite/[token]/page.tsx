import type { Metadata } from 'next';
import { redirect } from 'next/navigation';

import { openInvite } from '@/lib/auth/invites';
import { getUser } from '@/lib/auth/session';

import { InviteForm } from '@/components/auth/invite-form';

export const metadata: Metadata = { title: 'Join' };

// Checks the invite and session before anything shows, and may redirect,
// so the page waits for them rather than streaming a placeholder first
export const instant = false;

/**
 * Where an invite's link leads: open to whoever has it, as they've no
 * account yet. Someone signed in may still use it, to make another account,
 * unless it's for the account they're signed in as, which already exists.
 */
export default async function InvitePage({
  params,
}: PageProps<'/invite/[token]'>) {
  const { token } = await params;
  const invite = await openInvite(token);
  if (invite && (await getUser())?.email === invite.email) redirect('/');
  return (
    <InviteForm
      token={token}
      // Only what the form shows: the rest, as who sent it, stays here
      invite={invite && { email: invite.email, role: invite.role }}
    />
  );
}
