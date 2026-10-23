'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

import type { Me } from '@/lib/types';

/**
 * Where a mailed link sends someone back to, to be told how it went:
 * ?email=confirmed from confirming an address, ?email=changing&to=… from
 * either step of changing one, which Better Auth sends back to the same
 * place, and ?error=… added by it when a link didn't work.
 */
export const CONFIRMED_URL = '/?email=confirmed';
export const changingUrl = (to: string) =>
  `/?email=changing&to=${encodeURIComponent(to)}`;

/** Better Auth's reasons a link didn't work, in words. */
const ERRORS: Record<string, string> = {
  TOKEN_EXPIRED: 'The link has run out. Ask for a new one in Settings.',
  INVALID_TOKEN: "The link isn't right, or has been used already.",
  USER_NOT_FOUND: 'There is no account for that link any more.',
  INVALID_USER: 'The link is for another account than the one signed in.',
};

/**
 * Says how a mailed link went once it's brought them back, then takes the
 * note off the address, so a reload doesn't say it again.
 */
export function EmailNotice({ me }: { me: Me }) {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const kind = params.get('email');
    if (!kind) return;
    const error = params.get('error');
    const to = params.get('to') ?? '';
    // After the toaster's ready, which mounts beside this
    const timer = setTimeout(() => {
      if (error) {
        toast.error(
          kind === 'changing'
            ? "Your address wasn't changed"
            : "Your address wasn't confirmed",
          { description: ERRORS[error] ?? error }
        );
      } else if (kind === 'confirmed') {
        toast.success('Your address is confirmed', { description: me.email });
      } else if (kind === 'changing' && me.email !== to.toLowerCase()) {
        // The old address agreed; the new one confirms it next
        toast.success('Change agreed to', {
          description: `Now confirm ${to} from the mail just sent to it.`,
        });
      } else if (kind === 'changing') {
        toast.success('Your address is changed', { description: to });
      }
      // Along with saying it, so a run that's called off (as React does
      // once in development) leaves the note for the next
      params.delete('email');
      params.delete('to');
      params.delete('error');
      const rest = params.toString();
      window.history.replaceState(
        null,
        '',
        window.location.pathname + (rest ? `?${rest}` : '')
      );
    });
    return () => clearTimeout(timer);
  }, [me.email]);
  return null;
}
