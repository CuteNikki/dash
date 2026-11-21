'use client';

import { useTranslations } from 'next-intl';
import { useCallback } from 'react';

/** Better Auth's codes there are words for; any other says its own message. */
const CODES = [
  'BANNED_USER',
  'EMAIL_NOT_VERIFIED',
  'INVALID_BACKUP_CODE',
  'INVALID_CODE',
  'INVALID_EMAIL_OR_PASSWORD',
  'INVALID_PASSWORD',
  'INVALID_TOKEN',
  'OTP_HAS_EXPIRED',
  'PASSWORD_TOO_LONG',
  'PASSWORD_TOO_SHORT',
  'SESSION_EXPIRED',
  'TOO_MANY_ATTEMPTS',
  'TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE',
  'USER_ALREADY_EXISTS',
  'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL',
] as const;

type Code = (typeof CODES)[number];

const isCode = (code: unknown): code is Code => CODES.includes(code as Code);

/**
 * Why Better Auth said no, in the page's language: its code's words where
 * there are some, else its own message, else what was being done failing.
 */
export function useAuthError() {
  const t = useTranslations('authErrors');
  return useCallback(
    (
      error: { code?: string; message?: string } | null | undefined,
      fallback: string
    ) => (isCode(error?.code) ? t(error.code) : (error?.message ?? fallback)),
    [t]
  );
}
