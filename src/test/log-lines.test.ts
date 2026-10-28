import { describe, expect, test } from 'bun:test';

import { parseJsonLog, parseLogLine } from '@/lib/log-lines';

describe('parseJsonLog', () => {
  test("reads Caddy's: its level, logger and message apart from the rest", () => {
    const json = parseJsonLog(
      '{"level":"warn","ts":1793015851.62,"logger":"http.handlers.reverse_proxy","msg":"aborting with incomplete response","upstream":"dash:3000","request":{"method":"GET"}}'
    )!;
    expect(json.tone).toBe('warning');
    expect(json.logger).toBe('http.handlers.reverse_proxy');
    expect(json.message).toBe('aborting with incomplete response');
    expect(json.fields).toEqual([
      ['upstream', 'dash:3000'],
      ['request', { method: 'GET' }],
    ]);
  });

  test("reads pino's levels, which are numbers", () => {
    expect(parseJsonLog('{"level":50,"time":1,"msg":"boom"}')!.tone).toBe(
      'error'
    );
    expect(parseJsonLog('{"level":40,"msg":"hm"}')!.tone).toBe('warning');
    expect(parseJsonLog('{"level":30,"msg":"ok"}')!.tone).toBeUndefined();
  });

  test('leaves a name that is not text among the fields', () => {
    const json = parseJsonLog('{"message":"hi","name":{"first":"a"}}')!;
    expect(json.logger).toBeUndefined();
    expect(json.fields).toEqual([['name', { first: 'a' }]]);
  });

  test("isn't fooled by what isn't a JSON object", () => {
    expect(parseJsonLog('[1, 2]')).toBeUndefined();
    expect(parseJsonLog('{not json}')).toBeUndefined();
    expect(parseJsonLog('Started {server} on :3000')).toBeUndefined();
  });

  test('a log line keeps its text whole, for filtering and copying', () => {
    const line = parseLogLine(
      0,
      '2026-10-28T12:57:31.629Z {"level":"error","msg":"down"}'
    );
    expect(line.text).toBe('{"level":"error","msg":"down"}');
    expect(line.json?.tone).toBe('error');
  });
});
