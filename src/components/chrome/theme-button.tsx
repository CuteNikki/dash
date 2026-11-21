'use client';

import { useTranslations } from 'next-intl';
import { useTheme } from 'next-themes';

import { MonitorIcon, MoonIcon, SunIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const THEMES = [
  { value: 'light', icon: SunIcon },
  { value: 'dark', icon: MoonIcon },
  { value: 'system', icon: MonitorIcon },
] as const;

/** Light, dark or the system's, as a menu's choices, where a menu has them. */
export function ThemeItems() {
  const t = useTranslations('chrome');
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
      {THEMES.map(({ value, icon: Icon }) => (
        <DropdownMenuRadioItem key={value} value={value}>
          <Icon />
          {t(value)}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}

export function ThemeButton({ className }: { className?: string }) {
  const t = useTranslations('chrome');
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant='outline'
          size='icon'
          aria-label={t('theme')}
          className={className}
        >
          <SunIcon className='scale-100 rotate-0 transition-transform dark:scale-0 dark:-rotate-90' />
          <MoonIcon className='absolute scale-0 rotate-90 transition-transform dark:scale-100 dark:rotate-0' />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <ThemeItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
