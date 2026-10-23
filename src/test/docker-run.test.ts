import { describe, expect, test } from 'bun:test';

import { convertRun } from '@/lib/templates/docker-run';

describe('convertRun', () => {
  test('carries a run command over to a compose service', () => {
    const run = convertRun(
      'docker run -d --name web -p 8080:80 -v data:/data -e TZ=UTC --restart always nginx:1.27'
    );
    expect(run.name).toBe('web');
    expect(run.port).toBe('80');
    expect(run.skipped).toEqual([]);
    expect(run.compose).toContain('    image: nginx:1.27\n');
    expect(run.compose).toContain('    restart: always\n');
    expect(run.compose).toContain('"8080:80"');
    expect(run.compose).toContain('"TZ=UTC"');
    // A named volume is declared, and it joins Caddy's network
    expect(run.compose).toContain('\nvolumes:\n  data:');
    expect(run.compose).toContain('  caddy:\n    external: true');
  });

  test('reads one-letter flags run together as the flags they are', () => {
    const run = convertRun('docker run -dit --name web nginx');
    expect(run.name).toBe('web');
    expect(run.compose).toContain('    image: nginx\n');
    expect(convertRun('docker run -dp 8080:80 nginx').port).toBe('80');
  });

  test('keeps the command after the image, quotes and all', () => {
    const run = convertRun(`sudo docker run --rm -it alpine sh -c "echo hi"`);
    expect(run.name).toBe('alpine');
    expect(run.compose).toContain('    command: ["sh","-c","echo hi"]\n');
  });

  test("says which flags it doesn't carry over", () => {
    const run = convertRun('docker run --foo bar --dns 1.1.1.1 nginx');
    expect(run.skipped).toContain('--foo bar');
    expect(run.skipped).toContain('--dns 1.1.1.1');
    expect(run.compose).toContain('    image: nginx\n');
  });

  test("on the host's network it can't join Caddy's", () => {
    const run = convertRun('docker run --network host nginx');
    expect(run.compose).toContain('network_mode: host');
    expect(run.compose).not.toContain('external: true');
  });

  test('refuses what is no docker run, or runs nothing', () => {
    expect(() => convertRun('docker ps')).toThrow();
    expect(() => convertRun('docker run -d')).toThrow();
  });
});
