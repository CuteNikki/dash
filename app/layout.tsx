import type { Metadata, Viewport } from 'next';
import { Geist, JetBrains_Mono } from 'next/font/google';

import { cn } from '@/lib/utils';

import { ThemeProvider } from '@/components/chrome/theme-provider';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';

import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const jetbrainsMono = JetBrains_Mono({
  variable: '--font-jetbrains-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  // Where it's reached, so the icons and manifest are linked in full
  metadataBase: new URL(process.env.BETTER_AUTH_URL ?? 'https://dash.niso.moe'),
  title: { default: 'dash', template: '%s · dash' },
  description: 'Services, containers and files on the VPS',
  applicationName: 'dash',
  // Behind a sign-in, and nothing for a search engine to show
  robots: { index: false, follow: false },
  // Added to a phone's home screen, it opens on its own, named dash
  appleWebApp: { title: 'dash', capable: true },
};

export const viewport: Viewport = {
  // A phone's browser bar in the page's background, light or dark
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#0a0a0a' },
  ],
  colorScheme: 'light dark',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang='en'
      suppressHydrationWarning
      className={cn(
        // The scrollbar keeps its room when there's nothing to scroll, so a
        // shorter view, the list after the tiles, doesn't shift everything
        'h-full [scrollbar-gutter:stable] antialiased',
        geistSans.variable,
        jetbrainsMono.variable
      )}
    >
      <body className='flex min-h-full flex-col'>
        <ThemeProvider
          attribute='class'
          defaultTheme='system'
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
