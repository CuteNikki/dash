import type { Locale as DashLocale } from '@/i18n/locales';
import type messages from '@/i18n/messages/en.json';

// English is the source: every key the code uses has to be in it, with its
// arguments. Named apart from next-intl's own Locale, which inside its
// module would be that one rather than ours
declare module 'next-intl' {
  interface AppConfig {
    Locale: DashLocale;
    Messages: typeof messages;
  }
}
