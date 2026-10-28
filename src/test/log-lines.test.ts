import { describe, expect, test } from 'bun:test';

import {
  compactJson,
  parseJsonLog,
  parseLogLine,
  summaryFields,
} from '@/lib/log-lines';

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

describe('summaryFields', () => {
  const summary = (line: string) => summaryFields(parseJsonLog(line)!);

  test('leaves out empty fields, and hashes and ids too long to read', () => {
    expect(
      summary(
        '{"msg":"x","explanation_url":"","none":null,"list":[],"cert_hash":"d8663681c48771dc775498fa55915901b8aa3d9c324e0625d7e2a94cf3920ecd","upstream":"dash:3000"}'
      )
    ).toEqual([['upstream', 'dash:3000']]);
  });

  test('shows a short list or object as it is, a longer one folded', () => {
    expect(
      summary(
        '{"msg":"x","identifiers":["dash.niso.moe"],"request":{"method":"GET","uri":"/api/containers/90198df5/logs"}}'
      )
    ).toEqual([
      ['identifiers', '["dash.niso.moe"]'],
      ['request', '{…}'],
    ]);
  });

  test("rounds off a number's tail", () => {
    expect(
      summary(
        '{"msg":"x","duration":0.016825343,"next":1793214310.2864864,"n":3}'
      )
    ).toEqual([
      ['duration', '0.0168'],
      ['next', '1793214310'],
      ['n', '3'],
    ]);
  });

  test('keeps a long message with spaces, cut short and quoted', () => {
    const [[, error]] = summary(
      '{"msg":"x","error":"writing: write tcp 172.21.0.4:443->43.165.170.119:40204: write: broken pipe"}'
    );
    expect(error.startsWith('"writing: write tcp')).toBe(true);
    expect(error.endsWith('…')).toBe(true);
  });
});

describe('compactJson', () => {
  test("puts a header's list of one on its key's line, however long", () => {
    const agent = `Mozilla/5.0 (iPhone; CPU iPhone OS 13_2_3 like Mac OS X) ${'x'.repeat(60)}`;
    expect(
      compactJson({ headers: { 'User-Agent': [agent], Via: ['1.1 Caddy'] } })
    ).toBe(
      [
        '{',
        '  "headers": {',
        `    "User-Agent": [${JSON.stringify(agent)}],`,
        '    "Via": ["1.1 Caddy"]',
        '  }',
        '}',
      ].join('\n')
    );
  });

  test('keeps a short object on one line, and spreads a long one out', () => {
    expect(compactJson({ a: 1, b: [1, 2] })).toBe('{ "a": 1, "b": [1, 2] }');
    const long = { first: 'x'.repeat(40), second: 'y'.repeat(40) };
    expect(compactJson(long).split('\n')).toHaveLength(4);
  });

  test('reads back as the same value', () => {
    const value = { a: [1, { b: null }], c: '"quoted"', d: { e: [] }, f: {} };
    expect(JSON.parse(compactJson(value))).toEqual(value);
  });
});
