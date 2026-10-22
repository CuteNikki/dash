import type { ServiceUpdate } from '@/lib/types';

/**
 * An update in a few words, for a badge or a list: "v0.16.27", "16.16",
 * "16.15 rebuilt", "New latest" for an image that doesn't say its version,
 * "3 commits".
 */
export function updateLabel(update: ServiceUpdate) {
  if (update.kind === 'version') return update.to;
  if (update.kind === 'image') {
    if (update.rebuilt) return `${update.to} rebuilt`;
    return update.to ?? `New ${update.tag}`;
  }
  return `${update.behind} commit${update.behind === 1 ? '' : 's'}`;
}

/** What updating does, in a sentence. */
export function updateDescription(update: ServiceUpdate, name: string) {
  if (update.kind === 'version') {
    return `${update.from} → ${update.to}. The compose file is changed to the new version, which is pulled, and ${name} is recreated. If that fails, the file is put back and ${update.from} started again.`;
  }
  if (update.kind === 'image') {
    const what = update.rebuilt
      ? `${update.tag} has been built again, still ${update.to}, as on a newer base system`
      : update.to
        ? `${update.tag} is now ${update.to}`
        : `There's a newer image for ${update.tag}`;
    return `${what}. It's pulled, and ${name} is recreated with it, which restarts it.`;
  }
  return `${updateLabel(update)} on ${update.upstream} not pulled yet. They're pulled, and the stack is rebuilt and restarted.`;
}

/** Where a project's releases are listed, for one on GitHub. */
export function releasesUrl(source?: string) {
  const match = source?.match(/^https:\/\/github\.com\/([^/]+\/[^/#?]+)/);
  return match
    ? `https://github.com/${match[1].replace(/\.git$/, '')}/releases`
    : source;
}
