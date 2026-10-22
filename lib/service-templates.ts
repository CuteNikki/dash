import { CADDY_NETWORK } from '@/lib/new-service';

/**
 * Apps to start a new service from: each a compose file that runs it with its
 * data in the service's folder, on Caddy's network, and labelled with its
 * tile's name, icon and group. Images and icons checked to exist 2026-10-22.
 */
export type ServiceTemplate = {
  id: string;
  name: string;
  description: string;
  /** A dashboard-icons name, as a tile's icon */
  icon: string;
  group: string;
  image: string;
  /** The port it serves on, for Caddy */
  port: string;
  volumes?: string[];
  /** Given the stack's name, as a sidecar's address takes it */
  environment?: (name: string) => string[];
  command?: string;
  /** A Redis beside it, at <name>-broker */
  broker?: boolean;
};

export const TEMPLATES: ServiceTemplate[] = [
  {
    id: 'uptime-kuma',
    name: 'Uptime Kuma',
    description: 'Uptime monitoring',
    icon: 'uptime-kuma',
    group: 'Infrastructure',
    image: 'louislam/uptime-kuma:1',
    port: '3001',
    volumes: ['./data:/app/data'],
  },
  {
    id: 'vaultwarden',
    name: 'Vaultwarden',
    description: 'Password manager',
    icon: 'vaultwarden',
    group: 'Infrastructure',
    image: 'vaultwarden/server:latest',
    port: '80',
    volumes: ['./data:/data'],
  },
  {
    id: 'gitea',
    name: 'Gitea',
    description: 'Git hosting',
    icon: 'gitea',
    group: 'Dev',
    image: 'gitea/gitea:latest',
    port: '3000',
    volumes: ['./data:/data'],
    environment: () => ['USER_UID=1000', 'USER_GID=1000'],
  },
  {
    id: 'navidrome',
    name: 'Navidrome',
    description: 'Music streaming',
    icon: 'navidrome',
    group: 'Media',
    image: 'deluan/navidrome:latest',
    port: '4533',
    volumes: ['./data:/data', '/data/media/music:/music:ro'],
  },
  {
    id: 'audiobookshelf',
    name: 'Audiobookshelf',
    description: 'Audiobooks and podcasts',
    icon: 'audiobookshelf',
    group: 'Media',
    image: 'ghcr.io/advplyr/audiobookshelf:latest',
    port: '80',
    volumes: [
      './config:/config',
      './metadata:/metadata',
      '/data/media/audiobooks:/audiobooks',
    ],
  },
  {
    id: 'paperless',
    name: 'Paperless-ngx',
    description: 'Document archive',
    icon: 'paperless-ngx',
    group: 'Apps',
    image: 'ghcr.io/paperless-ngx/paperless-ngx:latest',
    port: '8000',
    volumes: [
      './data:/usr/src/paperless/data',
      './media:/usr/src/paperless/media',
      './consume:/usr/src/paperless/consume',
    ],
    environment: (name) => [`PAPERLESS_REDIS=redis://${name}-broker:6379`],
    broker: true,
  },
  {
    id: 'mealie',
    name: 'Mealie',
    description: 'Recipes and meal plans',
    icon: 'mealie',
    group: 'Apps',
    image: 'ghcr.io/mealie-recipes/mealie:latest',
    port: '9000',
    volumes: ['./data:/app/data'],
  },
  {
    id: 'actual',
    name: 'Actual Budget',
    description: 'Budgeting',
    icon: 'actual-budget',
    group: 'Apps',
    image: 'actualbudget/actual-server:latest',
    port: '5006',
    volumes: ['./data:/data'],
  },
  {
    id: 'memos',
    name: 'Memos',
    description: 'Notes',
    icon: 'memos',
    group: 'Apps',
    image: 'neosmemo/memos:stable',
    port: '5230',
    volumes: ['./data:/var/opt/memos'],
  },
  {
    id: 'linkding',
    name: 'linkding',
    description: 'Bookmarks',
    icon: 'linkding',
    group: 'Apps',
    image: 'sissbruecker/linkding:latest',
    port: '9090',
    volumes: ['./data:/etc/linkding/data'],
  },
  {
    id: 'freshrss',
    name: 'FreshRSS',
    description: 'Feed reader',
    icon: 'freshrss',
    group: 'Apps',
    image: 'freshrss/freshrss:latest',
    port: '80',
    volumes: [
      './data:/var/www/FreshRSS/data',
      './extensions:/var/www/FreshRSS/extensions',
    ],
  },
  {
    id: 'excalidraw',
    name: 'Excalidraw',
    description: 'Whiteboard',
    icon: 'excalidraw',
    group: 'Apps',
    image: 'excalidraw/excalidraw:latest',
    port: '80',
  },
  {
    id: 'stirling-pdf',
    name: 'Stirling PDF',
    description: 'PDF tools',
    icon: 'stirling-pdf',
    group: 'Apps',
    image: 'stirlingtools/stirling-pdf:latest',
    port: '8080',
  },
  {
    id: 'n8n',
    name: 'n8n',
    description: 'Workflow automation',
    icon: 'n8n',
    group: 'Dev',
    image: 'docker.n8n.io/n8nio/n8n:latest',
    port: '5678',
    // A volume rather than a folder: it runs as a user who couldn't write to
    // a folder Docker makes as root
    volumes: ['data:/home/node/.n8n'],
  },
  {
    id: 'it-tools',
    name: 'IT Tools',
    description: 'Developer utilities',
    icon: 'it-tools',
    group: 'Dev',
    image: 'corentinth/it-tools:latest',
    port: '80',
  },
  {
    id: 'ntfy',
    name: 'ntfy',
    description: 'Push notifications',
    icon: 'ntfy',
    group: 'Infrastructure',
    image: 'binwiederhier/ntfy:latest',
    port: '80',
    command: 'serve',
    volumes: ['./cache:/var/cache/ntfy'],
  },
];

/** Where a template starts: an image of your own, or one found on Docker Hub. */
export function blankTemplate(image = ''): ServiceTemplate {
  return {
    id: '',
    name: '',
    description: '',
    icon: '',
    group: '',
    image,
    port: '',
  };
}

const list = (key: string, items: string[]) =>
  items.length
    ? `    ${key}:\n${items.map((i) => `      - ${i}`).join('\n')}\n`
    : '';

/**
 * A template's compose file for a stack named `name`: its service named
 * after the stack, as its container is, and its tile labelled.
 */
export function composeFor(
  template: ServiceTemplate,
  name: string,
  group: string
) {
  const service = name || 'app';
  const volumes = template.volumes ?? [];
  const named = volumes
    .map((v) => v.split(':')[0])
    .filter((source) => !/^[./~]/.test(source));
  const labels = [
    ['homepage.name', template.name || service],
    ['homepage.icon', template.icon],
    ['homepage.group', group],
  ].filter(([, value]) => value);

  let yaml = `services:
  ${service}:
    image: ${template.image}
    container_name: ${service}
    restart: unless-stopped
`;
  if (template.command) yaml += `    command: ${template.command}\n`;
  yaml += list('environment', template.environment?.(service) ?? []);
  yaml += list('volumes', volumes);
  // With a sidecar, its own network too, to reach it
  yaml += list(
    'networks',
    template.broker ? ['default', CADDY_NETWORK] : [CADDY_NETWORK]
  );
  if (template.broker) yaml += list('depends_on', [`${service}-broker`]);
  if (labels.length) {
    yaml += `    labels:\n${labels.map(([k, v]) => `      ${k}: ${v}`).join('\n')}\n`;
  }
  if (template.broker) {
    yaml += `
  ${service}-broker:
    image: redis:7
    container_name: ${service}-broker
    restart: unless-stopped
`;
  }
  yaml += `
networks:
  ${CADDY_NETWORK}:
    external: true
`;
  if (named.length) {
    yaml += `
volumes:
${named.map((v) => `  ${v}:`).join('\n')}
`;
  }
  return yaml;
}
