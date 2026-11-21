import type { Locale } from '@/i18n/locales';
import type messages from '@/i18n/messages/en.json';

// English is the source: every key the code uses has to be in it, with its arguments
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale;
    Messages: typeof messages;
  }
}
