'use server';

import { z } from 'zod';

import { db } from '@/lib/db';
import { MAX_COLUMNS, MAX_ROWS } from '@/lib/layout';
import { ensureTiles } from '@/lib/services';
import { requireUser } from '@/lib/session';
import { MAX_DESCRIPTION } from '@/lib/tiles';

const MAX_NAME = 80;
const MAX_GROUP = 60;
const MAX_ICON = 500;
const MAX_ADDRESS = 300;
const MAX_ADDRESSES = 10;
/** Rows down a grid a tile can be put, far past any real one */
const MAX_ROW = 1000;

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
  await requireUser();
  const parsed = TileInput.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { key, ...tile } = parsed.data;
  const data = { ...tile, icon: tile.icon || null };
  await db.tile.upsert({
    where: { key },
    create: { key, ...data },
    update: data,
  });
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
  await requireUser();
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
    ...moved.map(({ key, group }) =>
      db.tile.update({ where: { key }, data: { group } })
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
  await requireUser();
  const tile = await db.tile.findUnique({ where: { key } });
  await db.tile.deleteMany({ where: { key } });
  return tile ?? undefined;
}

/** Puts back a tile's edits as a reset found them. */
export async function restoreTile(tile: TileSnapshot): Promise<TileResult> {
  await requireUser();
  const {
    key,
    name,
    description,
    icon,
    addresses,
    group,
    position,
    width,
    height,
    hidden,
  } = tile;
  const data = {
    name,
    description,
    icon,
    addresses,
    group,
    position,
    width,
    height,
    hidden,
  };
  await db.tile.upsert({
    where: { key },
    create: { key, ...data },
    update: data,
  });
}
