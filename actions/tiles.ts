'use server';

import { z } from 'zod';

import { db } from '@/lib/db';
import { requireUser } from '@/lib/session';

const MAX_NAME = 80;
const MAX_GROUP = 60;
const MAX_ICON = 500;

const TileInput = z.object({
  key: z.string().min(1),
  name: z.string().trim().min(1, 'Give it a name').max(MAX_NAME),
  icon: z.string().trim().max(MAX_ICON),
  url: z.union([
    z.literal(''),
    z.url({ protocol: /^https?$/, error: 'Enter an http:// or https:// link' }),
  ]),
  group: z.string().trim().min(1, 'Pick or type a group').max(MAX_GROUP),
  hidden: z.boolean(),
});

export type TileInput = z.input<typeof TileInput>;
export type TileResult = { error: string } | void;

/** Saves how a tile looks. An empty link means no link. */
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

/** Forgets a tile's edits, so it looks as its labels say again. */
export async function resetTile(key: string): Promise<TileResult> {
  await requireUser();
  await db.tile.deleteMany({ where: { key } });
}
