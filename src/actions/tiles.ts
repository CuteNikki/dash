'use server';

import { z } from 'zod';

import { record } from '@/lib/activity/record';
import { requireAccess } from '@/lib/auth/access';
import { MAX_COLUMNS, MAX_ROWS } from '@/lib/dashboard/layout';
import { ensureTiles } from '@/lib/dashboard/services';
import { isSiteKey, MAX_DESCRIPTION, SITE_PREFIX } from '@/lib/dashboard/tiles';
import { db } from '@/lib/db';

const MAX_NAME = 80;
const MAX_GROUP = 60;
const MAX_ICON = 500;
const MAX_ADDRESS = 300;
const MAX_ADDRESSES = 10;
/** Rows down a grid a tile can be put, far past any real one */
const MAX_ROW = 1000;
/** Services in a group being renamed, far past any real one */
const MAX_RENAMED = 1000;

const Group = z.string().trim().min(1, 'Pick or type a group').max(MAX_GROUP);

const TileInput = z.object({
  key: z.string().min(1),
  name: z.string().trim().min(1, 'Give it a name').max(MAX_NAME),
  // Empty for none, even where its labels have one
  description: z.string().trim().max(MAX_DESCRIPTION),
  icon: z.string().trim().max(MAX_ICON),
  // Links or plain text; one per line in the editor
  addresses: z
    .array(z.string().trim().max(MAX_ADDRESS))
    .transform((list) => list.filter(Boolean))
    .pipe(
      z.array(z.string()).max(MAX_ADDRESSES, `Up to ${MAX_ADDRESSES} addresses`)
    ),
  group: Group,
  hidden: z.boolean(),
});

export type TileInput = z.input<typeof TileInput>;
export type TileResult = { error: string } | void;

/** Saves how a tile looks. No addresses means none, not the labels' link. */
export async function saveTile(input: TileInput): Promise<TileResult> {
  const access = await requireAccess('manage');
  const parsed = TileInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { key, ...tile } = parsed.data;
  const data = { ...tile, icon: tile.icon || null };
  await db.tile.upsert({
    where: { key },
    create: { key, ...data },
    update: data,
  });
  await record(access, { action: 'tile.edit', target: tile.name });
}

/** A web address as typed, "https://" assumed when it has none. */
const SiteAddress = z
  .string()
  .trim()
  .min(1, 'Give it an address')
  .max(MAX_ADDRESS)
  .transform((a, ctx) => {
    try {
      const url = new URL(
        /^[a-z][a-z0-9+.-]*:\/\//i.test(a) ? a : `https://${a}`
      );
      if (/^https?:$/.test(url.protocol) && url.hostname.includes('.')) {
        return url.href;
      }
    } catch {}
    ctx.addIssue({ code: 'custom', message: "That isn't a web address" });
    return z.NEVER;
  });

const SiteInput = z.object({
  name: z.string().trim().min(1, 'Give it a name').max(MAX_NAME),
  address: SiteAddress,
  description: z.string().trim().max(MAX_DESCRIPTION),
  // Empty for none, which puts it in Other
  group: z.string().trim().max(MAX_GROUP),
});

export type SiteInput = z.input<typeof SiteInput>;

/**
 * Adds a website hosted elsewhere as a tile, which the dashboard then checks
 * over HTTP: its favicon for an icon until it's given one in Edit tile.
 */
export async function addSite(input: SiteInput): Promise<TileResult> {
  const access = await requireAccess('manage');
  const parsed = SiteInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { name, address, description, group } = parsed.data;
  const same = await db.tile.findFirst({
    where: { key: { startsWith: SITE_PREFIX }, addresses: { has: address } },
  });
  if (same)
    return { error: `${same.name ?? address} already has that address` };
  await db.tile.create({
    data: {
      key: SITE_PREFIX + crypto.randomUUID(),
      name,
      description: description || null,
      addresses: [address],
      group: group || null,
    },
  });
  await record(access, { action: 'site.add', target: name, detail: address });
}

const LayoutInput = z.object({
  /** Where each tile or section that changed now sits, in a grid of so many columns */
  cells: z.array(
    z
      .object({
        key: z.string().min(1),
        columns: z.number().int().min(1).max(MAX_COLUMNS),
        x: z
          .number()
          .int()
          .min(0)
          .max(MAX_COLUMNS - 1),
        y: z.number().int().min(0).max(MAX_ROW),
        w: z.number().int().min(1).max(MAX_COLUMNS),
        h: z.number().int().min(1).max(MAX_ROWS),
      })
      .refine((c) => c.x + c.w <= c.columns, {
        message: 'A tile goes past the last column',
      })
  ),
  /** Services dragged into another group */
  moved: z.array(z.object({ key: z.string().min(1), group: Group })),
});

export type LayoutInput = z.input<typeof LayoutInput>;

/** Saves where tiles or sections were dragged to, or resized. */
export async function saveLayout(input: LayoutInput): Promise<TileResult> {
  await requireAccess('manage');
  const parsed = LayoutInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { cells, moved } = parsed.data;
  await ensureTiles(moved.map((m) => m.key));
  await db.$transaction([
    ...cells.map(({ key, columns, ...cell }) =>
      db.tileLayout.upsert({
        where: { key_columns: { key, columns } },
        create: { key, columns, ...cell },
        update: cell,
      })
    ),
    // updateMany, as a container removed meanwhile has no row to update,
    // which is no reason to lose the rest
    ...moved.map(({ key, group }) =>
      db.tile.updateMany({ where: { key }, data: { group } })
    ),
  ]);
}

const OrderInput = z.object({
  /** Every group, in the order they're listed */
  groups: z.array(Group).max(MAX_RENAMED),
  /** Every service, in the order they're listed, and its group if it moved to another */
  services: z
    .array(z.object({ key: z.string().min(1), group: Group.optional() }))
    .max(MAX_RENAMED),
});

export type OrderInput = z.input<typeof OrderInput>;

/**
 * Saves the list's order, as its rows and groups were dragged: one order for
 * every screen, apart from the tiles', which each width has its own of.
 */
export async function saveListOrder(input: OrderInput): Promise<TileResult> {
  await requireAccess('manage');
  const parsed = OrderInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { groups, services } = parsed.data;
  await ensureTiles(services.map((s) => s.key));
  await db.$transaction([
    ...groups.map((name, position) =>
      db.group.upsert({
        where: { name },
        create: { name, position },
        update: { position },
      })
    ),
    // updateMany, as for the layout: a container removed meanwhile has no row
    ...services.map(({ key, group }, position) =>
      db.tile.updateMany({ where: { key }, data: { position, group } })
    ),
  ]);
}

export type TileSnapshot = NonNullable<
  Awaited<ReturnType<typeof db.tile.findUnique>>
>;

/** Forgets a tile's edits, returning them so they can be put back. */
export async function resetTile(
  key: string
): Promise<TileSnapshot | undefined> {
  const access = await requireAccess('manage');
  const tile = await db.tile.findUnique({ where: { key } });
  await db.tile.deleteMany({ where: { key } });
  // A website is only its tile, so resetting it removes it
  await record(access, {
    action: isSiteKey(key) ? 'site.remove' : 'tile.reset',
    target: tile?.name ?? key,
  });
  return tile ?? undefined;
}

/** A tile's edits as resetTile returned them, held to saveTile's limits. */
const TileSnapshot = z.object({
  key: z.string().min(1),
  name: z.string().max(MAX_NAME).nullable(),
  description: z.string().max(MAX_DESCRIPTION).nullable(),
  icon: z.string().max(MAX_ICON).nullable(),
  addresses: z.array(z.string().max(MAX_ADDRESS)).max(MAX_ADDRESSES),
  group: z.string().max(MAX_GROUP).nullable(),
  position: z.number().int().min(0).max(MAX_ROW).nullable(),
  width: z.number().int().min(1).max(MAX_COLUMNS),
  height: z.number().int().min(1).max(MAX_ROWS),
  hidden: z.boolean(),
});

/** Puts back a tile's edits as a reset found them. */
export async function restoreTile(tile: TileSnapshot): Promise<TileResult> {
  const access = await requireAccess('manage');
  const parsed = TileSnapshot.safeParse(tile);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { key, ...data } = parsed.data;
  await db.tile.upsert({
    where: { key },
    create: { key, ...data },
    update: data,
  });
  await record(access, { action: 'tile.restore', target: data.name ?? key });
}

const SECTION_KEY = 'section:group:';

/**
 * Renames a group: its services, its place among the groups and where its
 * section's been put. Renamed to one there already is, the two become one,
 * where that one was.
 */
export async function renameGroup(
  from: string,
  to: string,
  /** The services in it now, some of which may only be in it by their labels */
  keys: string[]
): Promise<TileResult> {
  const access = await requireAccess('manage');
  const input = z
    .object({
      from: Group,
      to: Group,
      keys: z.array(z.string().min(1)).max(MAX_RENAMED),
    })
    .safeParse({ from, to, keys });
  if (!input.success) return { error: input.error.issues[0].message };
  const { from: old, to: name, keys: services } = input.data;
  if (old === name) return;
  await ensureTiles(services);
  const [existing, layouts] = await Promise.all([
    db.group.findUnique({ where: { name } }),
    db.tileLayout.findMany({ where: { key: SECTION_KEY + name } }),
  ]);
  await db.$transaction([
    db.tile.updateMany({
      where: { OR: [{ key: { in: services } }, { group: old }] },
      data: { group: name },
    }),
    // Its place among the groups, unless it's joined one that has its own
    ...(existing
      ? [db.group.deleteMany({ where: { name: old } })]
      : [db.group.updateMany({ where: { name: old }, data: { name } })]),
    ...(layouts.length
      ? [db.tileLayout.deleteMany({ where: { key: SECTION_KEY + old } })]
      : [
          db.tileLayout.updateMany({
            where: { key: SECTION_KEY + old },
            data: { key: SECTION_KEY + name },
          }),
        ]),
    // Whoever sees the group sees it by its new name, and an invite to it
    // gives that, once each should they have had both
    db.$executeRaw`UPDATE "user" SET "allowedGroups" = ARRAY(SELECT DISTINCT g FROM unnest(array_replace("allowedGroups", ${old}, ${name})) g) WHERE ${old} = ANY("allowedGroups")`,
    db.$executeRaw`UPDATE "Invite" SET "groups" = ARRAY(SELECT DISTINCT g FROM unnest(array_replace("groups", ${old}, ${name})) g) WHERE ${old} = ANY("groups")`,
  ]);
  await record(access, {
    action: 'group.rename',
    target: old,
    detail: `to ${name}`,
  });
}
