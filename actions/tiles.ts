'use server';

import { z } from 'zod';

import { db } from '@/lib/db';
import { ensureTiles } from '@/lib/services';
import { requireUser } from '@/lib/session';
import { MAX_HEIGHT, MAX_WIDTH } from '@/lib/tile-size';

const MAX_NAME = 80;
const MAX_GROUP = 60;
const MAX_ICON = 500;
const MAX_ADDRESS = 300;
const MAX_ADDRESSES = 10;

const Width = z.number().int().min(1).max(MAX_WIDTH);
const Height = z.number().int().min(1).max(MAX_HEIGHT);
const Group = z.string().trim().min(1, 'Pick or type a group').max(MAX_GROUP);

const TileInput = z.object({
  key: z.string().min(1),
  name: z.string().trim().min(1, 'Give it a name').max(MAX_NAME),
  icon: z.string().trim().max(MAX_ICON),
  // Links or plain text; one per line in the editor
  addresses: z
    .array(z.string().trim().max(MAX_ADDRESS))
    .transform((list) => list.filter(Boolean))
    .pipe(
      z.array(z.string()).max(MAX_ADDRESSES, `Up to ${MAX_ADDRESSES} addresses`)
    ),
  group: Group,
  width: Width,
  height: Height,
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

const Arrangement = z.object({
  /** Every group, in order */
  groups: z.array(Group),
  /** Groups whose tiles moved, each with its tiles' keys in order */
  tiles: z.array(z.object({ group: Group, keys: z.array(z.string().min(1)) })),
});

export type Arrangement = z.input<typeof Arrangement>;

/** Saves where groups and tiles were dragged to. */
export async function arrangeTiles(input: Arrangement): Promise<TileResult> {
  await requireUser();
  const parsed = Arrangement.safeParse(input);
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { groups, tiles } = parsed.data;
  await ensureTiles(tiles.flatMap((g) => g.keys));
  await db.$transaction([
    ...groups.map((name, position) =>
      db.group.upsert({
        where: { name },
        create: { name, position },
        update: { position },
      })
    ),
    ...tiles.flatMap(({ group, keys }) =>
      keys.map((key, position) =>
        db.tile.update({ where: { key }, data: { group, position } })
      )
    ),
  ]);
}

/** Saves how many columns and rows a tile spans. */
export async function resizeTile(
  key: string,
  width: number,
  height: number
): Promise<TileResult> {
  await requireUser();
  const size = z.object({ width: Width, height: Height }).safeParse({
    width,
    height,
  });
  if (!size.success) return { error: size.error.issues[0].message };
  await ensureTiles([key]);
  await db.tile.update({ where: { key }, data: size.data });
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
  const { key, name, icon, addresses, group, position, width, height, hidden } =
    tile;
  const data = {
    name,
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
