import 'server-only';

import { posix } from 'node:path';

import { iconsNamed } from '@/lib/icon-search';
import type { ServiceTemplate } from '@/lib/service-templates';

/**
 * LinuxServer.io's images as templates, most pulled first: each image's
 * config there says its port, folders and settings, which Docker Hub
 * doesn't. Fetched at most once a day.
 */
const CATALOGUE =
  'https://api.linuxserver.io/api/v1/images?include_config=true&include_deprecated=false';

type Optional = { optional?: boolean };
type Image = {
  name: string;
  description: string;
  category: string;
  stable: boolean;
  monthly_pulls: number;
  project_logo?: string;
  config?: {
    ports?: (Optional & { internal: string; desc?: string })[];
    volumes?: (Optional & { path: string })[];
    env_vars?: (Optional & { name: string; value: string })[];
    custom?: (Optional & { name_compose?: string; value?: unknown })[];
    devices?: Optional[];
    caps?: Optional[];
    security_opt?: Optional[];
    networking?: string;
    privileged?: boolean;
  };
};

/** The dashboard's groups, by the first of an image's categories that says. */
const GROUPS: [RegExp, string][] = [
  [/Downloaders|Indexers|Media Management/, 'Downloads'],
  [/Media|Music|Audio|Books|Photos|Video/, 'Media'],
  [/Games/, 'Games'],
  [/Programming|Docker|Databases/, 'Dev'],
  [
    /Monitoring|Network|Administration|Backup|Storage|Reverse Proxy|Remote Desktop|Security|Cloud|FTP|File Sharing/,
    'Infrastructure',
  ],
];

const needed = <T extends Optional>(items: T[] = []) =>
  items.filter((i) => !i.optional);

/**
 * Whether it can run from a template as it is: one that must have the host's
 * network, devices, privileges or kernel capabilities isn't for one click,
 * and one with no port has nothing to open.
 */
function fits(image: Image) {
  const c = image.config ?? {};
  return (
    image.stable &&
    needed(c.ports).length > 0 &&
    !c.networking &&
    !c.privileged &&
    !needed(c.devices).length &&
    !needed(c.caps).length &&
    !needed(c.security_opt).length
  );
}

/**
 * Its first sentence, links as their text, short enough for a card, and
 * without its name to start, which the card shows above it: "radarr - A fork
 * of Sonarr…" is "A fork of Sonarr…".
 */
function summary(image: Image) {
  const plain = image.description
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[[\]]/g, '')
    .trim();
  const name = image.name.replace(/[-_.]/g, '[-_. ]?');
  const lead = new RegExp(
    `^(the )?${name}\\S*\\s*(\\([^)]*\\)\\s*)?(-|:|is|are)\\s+`,
    'i'
  );
  const rest = plain.replace(lead, '');
  const sentence = (rest.split(/(?<=[.!?])\s/)[0] ?? rest).trim();
  const shown = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  return shown.length > 90 ? `${shown.slice(0, 87)}…` : shown;
}

/**
 * What it's called: as its description names it in brackets, as many do
 * ("[WireGuard®] is…"), or else its image's name in words ("Code Server").
 */
function title(image: Image) {
  const named = /^\[([^\]]+)\]/.exec(image.description)?.[1];
  if (named) return named.replace(/[®™]/g, '').trim();
  return image.name
    .split(/[-_]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Its icon: one of the icon sets', as the other tiles have, or else its own
 * logo, unless that's a wide banner, which would be squeezed to nothing; then
 * its first letter.
 */
function iconFor(image: Image, icons: Map<string, string>) {
  const logo = image.project_logo ?? '';
  return icons.get(image.name) ?? (/banner/i.test(logo) ? '' : logo);
}

function template(image: Image, icons: Map<string, string>): ServiceTemplate {
  const c = image.config ?? {};
  const ports = needed(c.ports);
  // The web one, where it says, as that's what a domain is for
  const port =
    ports.find((p) => /web|http|gui|interface/i.test(p.desc ?? '')) ?? ports[0];
  const options = Object.fromEntries(
    needed(c.custom).flatMap((o) =>
      o.name_compose && typeof o.value === 'string'
        ? [[o.name_compose, o.value]]
        : []
    )
  );
  return {
    id: image.name,
    name: title(image),
    description: summary(image),
    icon: iconFor(image, icons),
    group:
      GROUPS.find(([pattern]) => pattern.test(image.category))?.[1] ?? 'Apps',
    image: `lscr.io/linuxserver/${image.name}:latest`,
    port: port.internal.replace(/\/(tcp|udp)$/, ''),
    // Each in a folder of the service's own, named as where it's mounted,
    // read-only where it says so ("/books:ro")
    volumes: needed(c.volumes).map((v) => {
      const [path, mode] = v.path.split(':');
      return `./${posix.basename(path)}:${path}${mode ? `:${mode}` : ''}`;
    }),
    environment: needed(c.env_vars).map((e) => `${e.name}=${e.value}`),
    ...(Object.keys(options).length ? { options } : {}),
  };
}

export async function linuxServerTemplates(): Promise<ServiceTemplate[]> {
  const res = await fetch(CATALOGUE, { next: { revalidate: 24 * 60 * 60 } });
  if (!res.ok) throw new Error(`LinuxServer.io answered ${res.status}`);
  const { data } = (await res.json()) as {
    data: { repositories: Record<string, Image[]> };
  };
  const images = Object.values(data.repositories)
    .flat()
    .filter(fits)
    .sort((a, b) => b.monthly_pulls - a.monthly_pulls);
  const icons = await iconsNamed(images.map((i) => i.name)).catch(
    () => new Map<string, string>()
  );
  return images.map((image) => template(image, icons));
}
