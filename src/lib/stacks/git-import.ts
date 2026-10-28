import { z } from 'zod';

/**
 * A service cloned from a git repository: where it's cloned from, and what
 * looking at it first found there to fill in the form with.
 */

/** The names Compose looks for a stack's file by, in the order it does. */
export const COMPOSE_NAMES = [
  'compose.yaml',
  'compose.yml',
  'docker-compose.yaml',
  'docker-compose.yml',
] as const;
export type ComposeName = (typeof COMPOSE_NAMES)[number];

/** Where an app keeps the settings it needs, to be filled in as its .env */
export const ENV_EXAMPLES = ['.env.example', '.env.sample'] as const;

/**
 * Over HTTPS or SSH, as a URL or as scp writes it ("git@host:owner/repo"):
 * not a path on the server, or file://, which would clone what's on it.
 */
const URL_PATTERN =
  /^(?:(?:https?|ssh|git):\/\/[^\s/]+\/\S+|[\w.-]+@[\w.-]+:[^\s/-]\S*)$/;

/** Git's own transports for those, which git is told to keep to. */
export const GIT_PROTOCOLS = 'https:http:ssh:git';

export const GitSource = z.object({
  url: z
    .string()
    .trim()
    .regex(
      URL_PATTERN,
      'A repository to clone over HTTPS or SSH, such as https://github.com/owner/repo'
    ),
  // Checked by git itself before it's used; this keeps out what isn't a
  // word, or would be read as an option
  branch: z
    .string()
    .trim()
    .regex(/^(?:[^\s-][^\s]*)?$/, "That's not a name a branch can have"),
});
export type GitSourceInput = z.input<typeof GitSource>;

/** What's in a repository that the form fills in from. */
export type RepoLook = {
  /** The branch looked at: the one asked for, or the repository's own */
  branch: string;
  /** Its compose file, if it has one */
  compose?: { name: ComposeName; text: string };
  /** An example .env, to fill in */
  env?: string;
  /** Its Dockerfile, which a compose file can build it from */
  dockerfile?: string;
};

/** A repository's name, from its URL, as Compose takes a project's. */
export function repoName(url: string) {
  const last = url.trim().replace(/\/+$/, '').split(/[/:]/).at(-1) ?? '';
  return last
    .replace(/\.git$/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/^[-_]+/, '');
}

/** The first port a Dockerfile says it serves on, for Caddy. */
export function exposedPort(dockerfile: string) {
  return /^\s*EXPOSE\s+(\d{1,5})/im.exec(dockerfile)?.[1] ?? '';
}
