import { unauthorized } from '@/lib/session';

/** The list of dashboard-icons, refreshed once a day. */
const TREE_URL =
  'https://cdn.jsdelivr.net/gh/homarr-labs/dashboard-icons/tree.json';
const REFRESH_MS = 24 * 60 * 60 * 1000;

let cached: { names: string[]; at: number } | undefined;

/** Every dashboard-icons name, without its variants for light and dark. */
async function iconNames() {
  if (cached && Date.now() - cached.at < REFRESH_MS) return cached.names;
  const res = await fetch(TREE_URL);
  if (!res.ok) throw new Error(`dashboard-icons: ${res.status}`);
  const tree: { svg?: string[] } = await res.json();
  const names = (tree.svg ?? [])
    .map((file) => file.replace(/\.svg$/, ''))
    .filter((name) => !/-(light|dark)$/.test(name))
    .sort();
  cached = { names, at: Date.now() };
  return names;
}

export async function GET() {
  const denied = await unauthorized();
  if (denied) return denied;
  try {
    return Response.json(await iconNames());
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 502 });
  }
}
