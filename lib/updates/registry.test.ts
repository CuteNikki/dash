import { describe, expect, test } from 'bun:test';

import { parseRef } from '@/lib/updates/registry';

describe('parseRef', () => {
  test('an official image is on Docker Hub, under library/', () => {
    expect(parseRef('nginx')).toEqual({
      registry: 'registry-1.docker.io',
      repo: 'library/nginx',
      tag: 'latest',
    });
  });

  test("a user's image is on Docker Hub as it's named", () => {
    expect(parseRef('louislam/uptime-kuma:2.0')).toEqual({
      registry: 'registry-1.docker.io',
      repo: 'louislam/uptime-kuma',
      tag: '2.0',
    });
  });

  test('a first part with a dot, a port or "localhost" is a registry', () => {
    expect(parseRef('lscr.io/linuxserver/sonarr:latest')).toEqual({
      registry: 'lscr.io',
      repo: 'linuxserver/sonarr',
      tag: 'latest',
    });
    expect(parseRef('localhost:5000/app:1.2')).toEqual({
      registry: 'localhost:5000',
      repo: 'app',
      tag: '1.2',
    });
    expect(parseRef('ghcr.io/owner/image')?.tag).toBe('latest');
  });

  test("an image pinned by digest, or an image's own ID, has no tag to follow", () => {
    expect(parseRef('nginx@sha256:abc')).toBeUndefined();
    expect(parseRef(`sha256:${'a'.repeat(64)}`)).toBeUndefined();
  });
});
