'use client';

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
  { value: 'light', label: 'Light', icon: SunIcon },
  { value: 'dark', label: 'Dark', icon: MoonIcon },
  { value: 'system', label: 'System', icon: MonitorIcon },
];

/** Light, dark or the system's, as a menu's choices, where a menu has them. */
export function ThemeItems() {
  const { theme, setTheme } = useTheme();
  return (
    <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
      {THEMES.map(({ value, label, icon: Icon }) => (
        <DropdownMenuRadioItem key={value} value={value}>
          <Icon />
          {label}
        </DropdownMenuRadioItem>
      ))}
    </DropdownMenuRadioGroup>
  );
}

export function ThemeButton({ className }: { className?: string }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant='outline'
          size='icon'
          aria-label='Theme'
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
