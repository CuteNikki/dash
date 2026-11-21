import type { useTranslations } from 'next-intl';

import type { ServiceUpdate } from '@/lib/types';

/** The updates namespace's translator, from useTranslations('updates') or getTranslations. */
export type UpdatesTranslator = ReturnType<typeof useTranslations<'updates'>>;

/**
 * An update in a few words, for a badge or a list: "v0.16.27", "16.16",
 * "16.15 rebuilt", "New latest" for an image that doesn't say its version,
 * "3 commits".
 */
export function updateLabel(update: ServiceUpdate, t: UpdatesTranslator) {
  if (update.kind === 'version') return update.to;
  if (update.kind === 'image') {
    if (update.rebuilt) return t('rebuilt', { to: update.to ?? update.tag });
    return update.to ?? t('newImage', { tag: update.tag });
  }
  if (!update.behind) return t('notRebuilt');
  return t('commits', { count: update.behind });
}

/** What updating does, in a sentence. */
export function updateDescription(
  update: ServiceUpdate,
  name: string,
  t: UpdatesTranslator
) {
  if (update.kind === 'version') {
    return t('describeVersion', { from: update.from, to: update.to, name });
  }
  if (update.kind === 'image') {
    return update.rebuilt
      ? t('describeRebuilt', { tag: update.tag, to: update.to ?? '', name })
      : update.to
        ? t('describeImage', { tag: update.tag, to: update.to, name })
        : t('describeNewImage', { tag: update.tag, name });
  }
  if (!update.behind) {
    return t('describeUnbuilt', { upstream: update.upstream, name });
  }
  return t('describeCommits', {
    count: update.behind,
    upstream: update.upstream,
  });
}

/** Where a project's releases are listed, for one on GitHub. */
export function releasesUrl(source?: string) {
  const match = source?.match(/^https:\/\/github\.com\/([^/]+\/[^/#?]+)/);
  return match
    ? `https://github.com/${match[1].replace(/\.git$/, '')}/releases`
    : source;
}
