'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';

/** Light or dark, following the system unless picked in the header. */
export function ThemeProvider(
  props: React.ComponentProps<typeof NextThemesProvider>
) {
  return <NextThemesProvider {...props} />;
}
