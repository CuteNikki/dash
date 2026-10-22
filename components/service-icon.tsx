'use client';

import { useState } from 'react';

import {
  ICON_SETS,
  iconFileUrl,
  parseIcon,
  type IconVariants,
} from '@/lib/icon-sets';
import { cn } from '@/lib/utils';

type IconSource =
  | { kind: 'image'; url: string }
  /** One-color icons, drawn in the text color so they suit either theme */
  | { kind: 'mask'; url: string }
  | { kind: 'letter' };

/**
 * Where an icon comes from, named the way Homepage names them: "jellyfin"
 * from dashboard-icons, "mdi-…", "si-…" or "sh-…" from the other sets, or a
 * full https:// address, such as an uploaded one.
 */
export function iconSource(icon: string): IconSource {
  if (!icon) return { kind: 'letter' };
  if (/^https:\/\//.test(icon)) return { kind: 'image', url: icon };
  // A path is one of Homepage's own files, which only Homepage can serve
  if (icon.includes('/')) return { kind: 'letter' };
  const url = iconFileUrl(icon);
  return ICON_SETS[parseIcon(icon).set].mono
    ? { kind: 'mask', url }
    : { kind: 'image', url };
}

/**
 * An app's icon, or its first letter when there's none to show. An icon
 * drawn for each kind of background shows the one that suits the theme.
 */
export function ServiceIcon({
  icon,
  name,
  variants,
  missing,
  className,
}: {
  icon: string;
  name: string;
  variants?: IconVariants;
  /** Known not to exist, so the letter shows without trying the image */
  missing?: boolean;
  className?: string;
}) {
  if (missing) {
    return <SingleIcon icon='' name={name} className={className} />;
  }
  if (!variants)
    return <SingleIcon icon={icon} name={name} className={className} />;
  return (
    <>
      <SingleIcon
        icon={variants.onLight}
        name={name}
        className={className}
        display='dark:hidden'
      />
      <SingleIcon
        icon={variants.onDark}
        name={name}
        className={className}
        display='hidden dark:flex'
      />
    </>
  );
}

function SingleIcon({
  icon,
  name,
  className,
  display,
}: {
  icon: string;
  name: string;
  className?: string;
  /** Which theme it shows in; last, so nothing else overrides it */
  display?: string;
}) {
  const [failed, setFailed] = useState<string>();
  const source =
    failed === icon ? { kind: 'letter' as const } : iconSource(icon);
  const box = cn('size-8 shrink-0', className);

  if (source.kind === 'mask') {
    return (
      // Its room around it as a share of its size, 4px of a tile's 32, so a
      // small one, as in the process list, isn't mostly room
      <span aria-hidden className={cn(box, 'p-[12.5%]', display)}>
        <span
          className='block size-full bg-foreground mask-contain mask-center mask-no-repeat'
          style={{ maskImage: `url("${source.url}")` }}
        />
      </span>
    );
  }
  if (source.kind === 'image') {
    return (
      // A plain img: these are small SVGs from a CDN, nothing to optimize
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={source.url}
        alt=''
        loading='lazy'
        onError={() => setFailed(icon)}
        // An image that failed before the page took over (on a reload) sent
        // its error to nobody; it's caught here, as the image is attached
        ref={(img) => {
          if (img?.complete && img.naturalWidth === 0) setFailed(icon);
        }}
        className={cn(box, 'object-contain', display)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        box,
        'flex items-center justify-center rounded-md bg-muted text-sm font-medium text-muted-foreground',
        display
      )}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
