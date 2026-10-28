import { describe, expect, test } from 'bun:test';

import { exposedPort, GitSource, repoName } from '@/lib/stacks/git-import';
import { blankTemplate, composeFor } from '@/lib/templates/service-templates';

const takes = (url: string, branch = '') =>
  GitSource.safeParse({ url, branch }).success;

describe('GitSource', () => {
  test('takes a repository over HTTPS or SSH', () => {
    expect(takes('https://github.com/owner/repo')).toBe(true);
    expect(takes('https://git.example.com/owner/repo.git')).toBe(true);
    expect(takes('ssh://git@git.example.com:2222/owner/repo.git')).toBe(true);
    expect(takes('git@github.com:owner/repo.git')).toBe(true);
  });

  test('refuses a path on the server, another transport, or an option', () => {
    expect(takes('/home/me/services/other')).toBe(false);
    expect(takes('file:///etc')).toBe(false);
    expect(takes('ext::sh -c touch% /tmp/x')).toBe(false);
    expect(takes('--upload-pack=touch /tmp/x')).toBe(false);
    expect(takes('git@host:--upload-pack=x')).toBe(false);
  });

  test('takes a branch, but not one read as an option', () => {
    expect(takes('https://github.com/owner/repo', 'feature/x')).toBe(true);
    expect(takes('https://github.com/owner/repo', '--orphan')).toBe(false);
    expect(takes('https://github.com/owner/repo', 'a b')).toBe(false);
  });
});

describe('repoName', () => {
  test("is the repository's name as Compose takes it", () => {
    expect(repoName('https://github.com/owner/My.App.git')).toBe('my-app');
    expect(repoName('git@github.com:owner/repo.git')).toBe('repo');
    expect(repoName('https://github.com/owner/repo/')).toBe('repo');
  });
});

describe('exposedPort', () => {
  test('is the first port a Dockerfile exposes', () => {
    expect(exposedPort('FROM node\nEXPOSE 3000\nEXPOSE 9229')).toBe('3000');
    expect(exposedPort('FROM node\nexpose 8080/tcp')).toBe('8080');
    expect(exposedPort('FROM node')).toBe('');
  });
});

describe('composeFor', () => {
  test('builds from a Dockerfile in place of an image', () => {
    const yaml = composeFor({ ...blankTemplate(), build: '.' }, 'app', 'Apps');
    expect(yaml).toContain('  app:\n    build: .\n');
    expect(yaml).not.toContain('image:');
  });
});
