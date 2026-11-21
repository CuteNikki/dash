import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getTranslations } from 'next-intl/server';
import { Geist, JetBrains_Mono } from 'next/font/google';
import localFont from 'next/font/local';

import { LucideProvider } from 'lucide-react';

import { cn } from '@/lib/utils';

import { ThemeProvider } from '@/components/chrome/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

import './globals.css';

import { ToastWords } from '@/components/common/toast-words';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
});
// JetBrains Mono's box drawing, block elements, arrows and shapes, which
// Google's subsets leave out: a log's tables drawn in another font, its
// lines another width than the letters, don't line up. Fetched only for a
// page that has some
const monoSymbols = localFont({
  src: './fonts/jetbrains-mono-symbols.woff2',
  variable: '--font-mono-symbols',
  weight: '100 800',
  declarations: [{ prop: 'unicode-range', value: 'U+2190-21FF, U+2500-25FF' }],
  adjustFontFallback: false,
  preload: false,
});

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('meta');
  return {
    title: { default: 'Dashboard', template: '%s · Dashboard' },
    description: t('description'),
    applicationName: 'Dashboard',
    // Behind a sign-in, and nothing for a search engine to show
    robots: { index: false, follow: false },
    // Added to a phone's home screen, it opens on its own, named Dashboard
    appleWebApp: { title: 'Dashboard', capable: true },
  };
}

export const viewport: Viewport = {
  // A phone's browser bar in the page's background, light or dark
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
  colorScheme: 'light dark',
};

// Every page is in its reader's language, from their cookie or their
// browser's, so none is the same for everyone to prerender; each already
// waits for its sign-in, so none waits longer for it
export const instant = false;

// Icons a little lighter than lucide's 2, so they sit with the text instead of
// outweighing it. An icon's own strokeWidth still wins.
const ICON_STROKE_WIDTH = 1.75;

export default async function RootLayout({ children }: LayoutProps<'/'>) {
  // The person's language, from their setting or their browser's
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={cn(
        // The scrollbar keeps its room when there's nothing to scroll, so a
        // shorter view, the list after the tiles, doesn't shift everything
        'h-full scrollbar-gutter-stable antialiased',
        geistSans.variable,
        jetbrainsMono.variable,
        monoSymbols.variable
      )}
    >
      <body className='flex min-h-full flex-col'>
        <ThemeProvider
          attribute='class'
          defaultTheme='system'
          enableSystem
          disableTransitionOnChange
        >
          <NextIntlClientProvider>
            <ToastWords />
            <LucideProvider strokeWidth={ICON_STROKE_WIDTH}>
              <TooltipProvider>
                {children}
                <Toaster />
              </TooltipProvider>
            </LucideProvider>
          </NextIntlClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
