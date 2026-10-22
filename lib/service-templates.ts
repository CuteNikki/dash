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
  {
    id: 'gotify',
    name: 'Gotify',
    description: 'Notifications',
    icon: 'gotify',
    group: 'Infrastructure',
    image: 'gotify/server:latest',
    port: '80',
    volumes: ['./data:/app/data'],
  },
  {
    id: 'grafana',
    name: 'Grafana',
    description: 'Graphs and dashboards',
    icon: 'grafana',
    group: 'Infrastructure',
    image: 'grafana/grafana-oss:latest',
    port: '3000',
    // A volume: it runs as a user of its own, who couldn't write to a folder
    volumes: ['data:/var/lib/grafana'],
  },
  {
    id: 'changedetection',
    name: 'changedetection.io',
    description: 'Website change alerts',
    icon: 'changedetection',
    group: 'Infrastructure',
    image: 'ghcr.io/dgtlmoon/changedetection.io:latest',
    port: '5000',
    volumes: ['./data:/datastore'],
  },
  {
    id: 'nextcloud',
    name: 'Nextcloud',
    description: 'Files and sync',
    icon: 'nextcloud',
    group: 'Apps',
    image: 'nextcloud:latest',
    port: '80',
    volumes: ['./html:/var/www/html'],
  },
  {
    id: 'searxng',
    name: 'SearXNG',
    description: 'Private search',
    icon: 'searxng',
    group: 'Apps',
    image: 'searxng/searxng:latest',
    port: '8080',
    volumes: ['./config:/etc/searxng'],
  },
  {
    id: 'vikunja',
    name: 'Vikunja',
    description: 'To-do lists',
    icon: 'vikunja',
    group: 'Apps',
    image: 'vikunja/vikunja:latest',
    port: '3456',
    // Volumes: it runs as a user of its own, who couldn't write to folders
    volumes: ['files:/app/vikunja/files', 'db:/db'],
    environment: () => [
      'VIKUNJA_DATABASE_TYPE=sqlite',
      'VIKUNJA_DATABASE_PATH=/db/vikunja.db',
    ],
  },
  {
    id: 'kanboard',
    name: 'Kanboard',
    description: 'Kanban boards',
    icon: 'kanboard',
    group: 'Apps',
    image: 'kanboard/kanboard:latest',
    port: '80',
    volumes: ['./data:/var/www/app/data', './plugins:/var/www/app/plugins'],
  },
  {
    id: 'homebox',
    name: 'Homebox',
    description: 'Home inventory',
    icon: 'homebox',
    group: 'Apps',
    image: 'ghcr.io/sysadminsmedia/homebox:latest',
    port: '7745',
    volumes: ['./data:/data'],
  },
  {
    id: 'drawio',
    name: 'draw.io',
    description: 'Diagrams',
    icon: 'draw-io',
    group: 'Apps',
    image: 'jgraph/drawio:latest',
    port: '8080',
  },
  {
    id: 'kavita',
    name: 'Kavita',
    description: 'Books and comics',
    icon: 'kavita',
    group: 'Media',
    image: 'jvmilazz0/kavita:latest',
    port: '5000',
    volumes: ['./config:/kavita/config', '/data/media/books:/books'],
  },
  {
    id: 'calibre-web',
    name: 'Calibre-Web',
    description: 'E-book library',
    icon: 'calibre-web',
    group: 'Media',
    image: 'lscr.io/linuxserver/calibre-web:latest',
    port: '8083',
    volumes: ['./config:/config', '/data/media/books:/books'],
    environment: () => ['PUID=1000', 'PGID=1000', 'TZ=Etc/UTC'],
  },
  {
    id: 'bazarr',
    name: 'Bazarr',
    description: 'Subtitles for Sonarr and Radarr',
    icon: 'bazarr',
    group: 'Downloads',
    image: 'lscr.io/linuxserver/bazarr:latest',
    port: '6767',
    volumes: ['./config:/config', '/data:/data'],
    environment: () => ['PUID=1000', 'PGID=1000', 'TZ=Etc/UTC'],
  },
  {
    id: 'lidarr',
    name: 'Lidarr',
    description: 'Music downloads',
    icon: 'lidarr',
    group: 'Downloads',
    image: 'lscr.io/linuxserver/lidarr:latest',
    port: '8686',
    volumes: ['./config:/config', '/data:/data'],
    environment: () => ['PUID=1000', 'PGID=1000', 'TZ=Etc/UTC'],
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
