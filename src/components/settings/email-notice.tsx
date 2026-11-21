'use client';

import { useTranslations } from 'next-intl';
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

/** Better Auth's reasons a link didn't work, by their keys under "emailNotice.errors". */
const ERRORS = [
  'TOKEN_EXPIRED',
  'INVALID_TOKEN',
  'USER_NOT_FOUND',
  'INVALID_USER',
] as const;

const isKnown = (code: string): code is (typeof ERRORS)[number] =>
  ERRORS.includes(code as (typeof ERRORS)[number]);

/**
 * Says how a mailed link went once it's brought them back, then takes the
 * note off the address, so a reload doesn't say it again.
 */
export function EmailNotice({ me }: { me: Me }) {
  const t = useTranslations('emailNotice');
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const kind = params.get('email');
    if (!kind) return;
    const error = params.get('error');
    const to = params.get('to') ?? '';
    // After the toaster's ready, which mounts beside this
    const timer = setTimeout(() => {
      if (error) {
        toast.error(kind === 'changing' ? t('notChanged') : t('notConfirmed'), {
          description: isKnown(error) ? t(`errors.${error}`) : error,
        });
      } else if (kind === 'confirmed') {
        toast.success(t('confirmed'), { description: me.email });
      } else if (kind === 'changing' && me.email !== to.toLowerCase()) {
        // The old address agreed; the new one confirms it next
        toast.success(t('agreed'), {
          description: t('nowConfirm', { email: to }),
        });
      } else if (kind === 'changing') {
        toast.success(t('changed'), { description: to });
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
  }, [me.email, t]);
  return null;
}
