import 'server-only';

import { runCompose, startCompose, type Stack } from '@/lib/docker/compose';
import type { Container } from '@/lib/docker/docker';
import type { RunLine } from '@/lib/docker/runner';
import { gitPull, gitStatus } from '@/lib/git';
import { readHostFile, writeHostFile } from '@/lib/host/host-files';
import { DASH_PROJECT } from '@/lib/site';
import { say, shown } from '@/lib/stacks/service-stacks';
import { forgetUpdate, updateOf } from '@/lib/updates/check';

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
 * other than for a rebuild.
 */
export async function* updateService(
  c: Container
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
  if (stack.project === DASH_PROJECT) return yield* restartDash(stack);
  yield say(`Rebuilding ${stack.project}…`);
  const up = yield* runCompose(stack, ['up', '-d', '--build']);
  if (up === 0) forgetUpdate(c);
  return up;
}

/**
 * The dashboard's own rebuild: built and its database migrated while it's here to say
 * how that goes, then recreated by a run it doesn't wait for, as recreating
 * it ends this one. A migration that fails leaves this dashboard running.
 */
async function* restartDash(stack: Stack): AsyncGenerator<RunLine, number> {
  yield say('Building the dashboard…');
  const built = yield* runCompose(stack, ['build']);
  if (built !== 0) return built;
  yield say('Migrating its database…');
  const migrated = yield* runCompose(stack, ['run', '--rm', 'migrate']);
  if (migrated !== 0) return migrated;
  await startCompose(stack, ['up', '-d']);
  yield say("Restarting the dashboard on the new build; it's back in a moment");
  return 0;
}
