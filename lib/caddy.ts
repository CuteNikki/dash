/** Where Caddy's official image reads its config, the folder mounted there. */
const CADDYFILE = '/etc/caddy/Caddyfile';

/** Whether a container runs Caddy, from its image, e.g. "caddy:2.11.7". */
export function isCaddy(image: string) {
  return /^(docker\.io\/)?(library\/)?caddy(:|@|$)/.test(image);
}

/**
 * Has a running Caddy read its Caddyfile again, with no restart, so no site
 * drops a connection. Caddy checks the new config first and keeps the old
 * one if it's wrong.
 */
export const RELOAD_CADDY = [
  'caddy',
  'reload',
  '--config',
  CADDYFILE,
  '--adapter',
  'caddyfile',
];

/**
 * Why a reload failed, from what Caddy printed: its error log line's message,
 * or its plain "Error: …" line, with the file named rather than its path.
 */
export function reloadError(stderr: string) {
  const lines = stderr.trim().split('\n').reverse();
  for (const line of lines) {
    try {
      const entry = JSON.parse(line) as { level?: string; msg?: string };
      if (entry.level === 'error' && entry.msg) return shorten(entry.msg);
    } catch {
      if (line.startsWith('Error:')) return shorten(line.slice(6).trim());
    }
  }
  return lines[0] || 'Caddy gave no reason';
}

function shorten(message: string) {
  return message.replaceAll(`${CADDYFILE}:`, 'Caddyfile line ');
}
