import 'server-only';

import { resolve4, resolve6 } from 'node:dns/promises';

import { listHostDir, readHostFile } from '@/lib/host-files';
import { findCaddy } from '@/lib/service-stacks';
import { SERVER_NAME } from '@/lib/site';

/** Where a domain's DNS points: at this server, somewhere else, or nowhere yet. */
export type DomainCheck =
  | { points: 'here' }
  | { points: 'elsewhere'; addresses: string[]; server: string[] }
  | { points: 'nowhere'; server: string[] };

/** A host's addresses, IPv4 and IPv6, none where it has no record. */
async function addresses(host: string) {
  const [v4, v6] = await Promise.all([
    resolve4(host).catch(() => [] as string[]),
    resolve6(host).catch(() => [] as string[]),
  ]);
  return [...v4, ...v6];
}

/**
 * Whether a domain points at this server, as its own name does: any address
 * they share will do, as either may also have one the other hasn't.
 */
export async function checkDomain(domain: string): Promise<DomainCheck> {
  const [found, server] = await Promise.all([
    addresses(domain),
    addresses(SERVER_NAME),
  ]);
  if (!found.length) return { points: 'nowhere', server };
  if (found.some((a) => server.includes(a))) return { points: 'here' };
  return { points: 'elsewhere', addresses: found, server };
}

/** The last two labels of a host name, which its sites share: "git.niso.moe" → "niso.moe". */
const zoneOf = (host: string) => host.split('.').slice(-2).join('.');

/**
 * The domains this server's sites are under, its own first: what a new
 * service's address can end in. Read from Caddy's site files' addresses.
 */
export async function siteDomains() {
  const zones = new Set([zoneOf(SERVER_NAME)]);
  const caddy = await findCaddy().catch(() => undefined);
  if (!caddy) return [...zones];
  const files = (await listHostDir(caddy.sites)).filter((e) =>
    e.name.endsWith('.caddy')
  );
  for (const file of files) {
    const text = (await readHostFile(`${caddy.sites}/${file.name}`)) ?? '';
    // A site's addresses start a line and end with its opening brace
    for (const [, line] of text.matchAll(/^([a-z0-9][^\s{#(]*[^{]*)\{/gim)) {
      for (const host of line.split(/[\s,]+/).filter(Boolean)) {
        if (/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(host)) zones.add(zoneOf(host));
      }
    }
  }
  return [...zones];
}
