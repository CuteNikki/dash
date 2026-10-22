import type { ServiceUpdate } from '@/lib/types';

/** An update in a few words, for a badge or a list: "v0.16.27", "New latest", "3 commits". */
export function updateLabel(update: ServiceUpdate) {
  if (update.kind === 'version') return update.to;
  if (update.kind === 'image') return `New ${update.tag}`;
  return `${update.behind} commit${update.behind === 1 ? '' : 's'}`;
}

/** What updating does, in a sentence. */
export function updateDescription(update: ServiceUpdate, name: string) {
  if (update.kind === 'version') {
    return `${update.from} → ${update.to}. The compose file is changed to the new version, which is pulled, and ${name} is recreated. If that fails, the file is put back and ${update.from} started again.`;
  }
  if (update.kind === 'image') {
    return `There's a newer image for ${update.tag}. It's pulled, and ${name} is recreated with it, which restarts it.`;
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
