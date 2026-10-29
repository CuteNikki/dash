import 'server-only';

import { runCompose, type Stack } from '@/lib/docker/compose';
import type { Container } from '@/lib/docker/docker';
import type { RunLine } from '@/lib/docker/runner';
import { gitPull, gitStatus } from '@/lib/git';
import { readHostFile, writeHostFile } from '@/lib/host/host-files';
import { DASH_PROJECT } from '@/lib/site';
import { say, shown } from '@/lib/stacks/service-stacks';
import {
  clearFailedBuild,
  forgetUpdate,
  noteFailedBuild,
  updateOf,
} from '@/lib/updates/check';
import {
  followSelfUpdate,
  selfUpdateRunning,
  startSelfUpdate,
  type SelfUpdateBy,
} from '@/lib/updates/self-update';

/**
 * How many updates Update all runs at once: one unless UPDATES_AT_ONCE says
 * more, as each rebuild can take all of a small server's memory, and pulls
 * share its connection.
 */
export const UPDATES_AT_ONCE = Math.max(
  1,
  Math.floor(Number(process.env.UPDATES_AT_ONCE)) || 1
);

/** Each line of what something printed, as the run's own. */
function* printed(output: string): Generator<RunLine> {
  for (const line of output.split('\n')) if (line.trim()) yield say(line);
}

/** An `image:` line naming exactly this image, quoted or not, with a comment or not. */
function imageLine(image: string) {
  const escaped = image.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    `^(\\s*image:\\s*["']?)${escaped}(["']?\\s*(?:#.*)?)$`,
    'gm'
  );
}

/**
 * Points the stack's compose file at a new version: the one `image:` line
 * naming the old one, which must be written out there, not put together
 * from a variable. Returns how to put it back.
 */
async function bumpImage(stack: Stack, from: string, to: string) {
  const found: { file: string; text: string }[] = [];
  for (const file of stack.files) {
    const text = await readHostFile(file);
    if (text && imageLine(from).test(text)) found.push({ file, text });
  }
  const lines = found.reduce(
    (n, f) => n + (f.text.match(imageLine(from))?.length ?? 0),
    0
  );
  if (lines !== 1) {
    throw new Error(
      lines
        ? `${from} is named on ${lines} image: lines; change the version by hand`
        : `There's no image: ${from} line in the compose file to change; change the version by hand`
    );
  }
  const { file, text } = found[0];
  await writeHostFile(file, text.replace(imageLine(from), `$1${to}$2`));
  return { file, restore: () => writeHostFile(file, text) };
}

/**
 * Updates a container to what was last found for it, saying what it does as
 * it goes: pulls a newer image under its tag and recreates it; or moves its
 * compose file to a newer version, putting the file back if that fails; or,
 * built here, pulls its repository and rebuilds its stack, as more than one
 * of its services can come from it. Nothing else in its stack restarts,
 * other than for a rebuild. The dashboard's own rebuild notes itself in the
 * activity log, as by `by`, as the dashboard's gone before it ends.
 */
export async function* updateService(
  c: Container,
  by: SelfUpdateBy
): AsyncGenerator<RunLine, number> {
  const stack = c.stack;
  if (!stack) {
    throw new Error(
      "It isn't part of a compose stack, so the dashboard can't recreate it"
    );
  }
  const { update, error } = updateOf(c);
  if (error) throw new Error(`Couldn't check it for updates: ${error}`);
  if (!update) throw new Error("There's no update for it");
  const { service } = stack;

  if (update.kind === 'image') {
    yield say(`Pulling ${c.image}…`);
    const pulled = yield* runCompose(stack, ['pull', service]);
    if (pulled !== 0) return pulled;
    yield say(`Recreating ${c.name}…`);
    const up = yield* runCompose(stack, ['up', '-d', service]);
    if (up === 0) forgetUpdate(c);
    return up;
  }

  if (update.kind === 'version') {
    const to = c.image.slice(0, -update.from.length) + update.to;
    const bumped = await bumpImage(stack, c.image, to);
    let restored = false;
    try {
      yield say(`${shown(bumped.file)}: ${c.image} → ${to}`);
      yield say(`Pulling ${to}…`);
      const pulled = yield* runCompose(stack, ['pull', service]);
      if (pulled !== 0) {
        await bumped.restore();
        restored = true;
        yield say(`Put ${shown(bumped.file)} back as it was`);
        return pulled;
      }
      yield say(`Recreating ${c.name}…`);
      const up = yield* runCompose(stack, ['up', '-d', service]);
      if (up !== 0) {
        await bumped.restore();
        restored = true;
        yield say(
          `Put ${shown(bumped.file)} back as it was; starting ${update.from} again…`
        );
        yield* runCompose(stack, ['up', '-d', service]);
        return up;
      }
    } catch (error) {
      // Compose that couldn't run at all, as while Docker restarts, leaves
      // the file naming a version that isn't running, for the next deploy
      if (!restored) {
        const back = await bumped.restore().then(
          () => true,
          () => false
        );
        yield say(
          back
            ? `Put ${shown(bumped.file)} back as it was`
            : `Couldn't put ${shown(bumped.file)} back; it still names ${to}`
        );
      }
      throw error;
    }
    forgetUpdate(c);
    return 0;
  }

  const repo = await gitStatus(stack.dir);
  if (!repo) throw new Error(`${shown(stack.dir)} isn't in a repository`);
  if (repo.changes.length) {
    yield say(
      `${repo.changes.length} uncommitted change(s) in ${shown(repo.root)}; git pulls only if they don't touch what's coming`
    );
  }
  yield say(`Pulling ${update.upstream} into ${shown(repo.root)}…`);
  const pull = await gitPull(repo.root);
  yield* printed(pull.output);
  if (!pull.ok) return 1;
  if (stack.project === DASH_PROJECT) return yield* restartDash(stack, by);
  yield say(`Rebuilding ${stack.project}…`);
  let up: number;
  try {
    up = yield* runCompose(stack, ['up', '-d', '--build']);
  } catch (error) {
    // Compose that couldn't run at all, as while Docker restarts
    await noteFailedBuild(c, repo.root);
    throw error;
  }
  if (up === 0) {
    await clearFailedBuild(repo.root);
    forgetUpdate(c);
  } else {
    await noteFailedBuild(c, repo.root);
    yield say(
      `It's pulled but still runs what came before; Update rebuilds it again`
    );
  }
  return up;
}

/**
 * The dashboard's own rebuild, built, migrated and recreated by a job of its
 * own, as recreating it ends this request, followed from here for as long as
 * this dashboard's up to; a window follows the rest from the new one. A
 * build or migration that fails leaves this dashboard running. One already
 * going on is followed instead, as two at once fight over the container.
 */
async function* restartDash(
  stack: Stack,
  by: SelfUpdateBy
): AsyncGenerator<RunLine, number> {
  if (await selfUpdateRunning()) {
    yield say('The dashboard is already being rebuilt; following that one');
    return yield* followSelfUpdate();
  }
  await startSelfUpdate(stack, by);
  return yield* followSelfUpdate();
}
