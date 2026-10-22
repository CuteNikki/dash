import 'server-only';

/** An image on Docker Hub, as a search finds it. */
export type HubImage = {
  /** As it's pulled, e.g. "postgres" or "gitea/gitea" */
  image: string;
  description: string;
  /** Roughly, as Hub puts it: "100M+" */
  pulls: string;
  official: boolean;
};

type HubResult = {
  id: string;
  type: string;
  badge?: string;
  short_description?: string;
  pull_count?: string;
};

/**
 * Images on Docker Hub matching a search, best first. This is the search
 * Hub's own site uses, which ranks far better than its documented one (that
 * put forgotten forks above gitea/gitea); undocumented, so if it changes the
 * search finds nothing and the templates are still there. Docker's hardened
 * images are left out, as pulling one needs a login of its own.
 */
export async function searchImages(query: string, limit: number) {
  const url = new URL('https://hub.docker.com/api/search/v4');
  url.searchParams.set('query', query);
  url.searchParams.set('from', '0');
  url.searchParams.set('size', String(limit * 2));
  const res = await fetch(url, { next: { revalidate: 3600 } });
  if (!res.ok) throw new Error(`Docker Hub answered ${res.status}`);
  const { results } = (await res.json()) as { results: HubResult[] };
  return results
    .filter((r) => r.type === 'image')
    .slice(0, limit)
    .map((r): HubImage => ({
      // Official images are pulled by their name alone
      image: r.id.replace(/^library\//, ''),
      description: r.short_description ?? '',
      pulls: r.pull_count ?? '',
      official: r.badge === 'official',
    }));
}
