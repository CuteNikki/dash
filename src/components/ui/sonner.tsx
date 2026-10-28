'use client';

import { useTheme } from 'next-themes';
import { Toaster as Sonner, type ToasterProps } from 'sonner';

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from 'lucide-react';

/**
 * A kind of toast's colors, from the theme's own, so they follow it: a wash
 * of it behind, and its border, with the text as any toast's, so a long
 * output stays readable. Its icon takes the color whole.
 */
const tone = (kind: string, color: string) => ({
  [`--${kind}-bg`]: `color-mix(in oklch, var(${color}) 12%, var(--popover))`,
  [`--${kind}-border`]: `color-mix(in oklch, var(${color}) 45%, var(--popover))`,
  [`--${kind}-text`]: 'var(--popover-foreground)',
});

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      className='group'
      // Told apart at a glance: a failure red, a success green
      richColors
      icons={{
        success: <CircleCheckIcon className='size-4' />,
        info: <InfoIcon className='size-4' />,
        warning: <TriangleAlertIcon className='size-4' />,
        error: <OctagonXIcon className='size-4' />,
        loading: <Loader2Icon className='size-4 animate-spin' />,
      }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
          '--border-radius': 'var(--radius)',
          ...tone('success', '--success'),
          ...tone('warning', '--warning'),
          ...tone('error', '--destructive'),
          // Info as any toast is, rather than in Sonner's own blue
          '--info-bg': 'var(--popover)',
          '--info-border': 'var(--border)',
          '--info-text': 'var(--popover-foreground)',
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: 'cn-toast',
          icon: 'in-data-[type=error]:text-destructive in-data-[type=success]:text-success in-data-[type=warning]:text-warning',
        },
      }}
      {...props}
    />
  );
};

export { Toaster };
