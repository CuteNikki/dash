import { describe, expect, test } from 'bun:test';

import {
  changesOf,
  fieldsOf,
  filesOf,
  parseCommit,
  partsOf,
} from '@/lib/git-output';

describe('partsOf', () => {
  test('splits output at the marks between its parts', () => {
    expect(partsOf(['a', '--m--', 'b', 'c', '--m--'], '--m--')).toEqual([
      ['a'],
      ['b', 'c'],
      [],
    ]);
  });
});

describe('changesOf', () => {
  test('reads git status -z, renames with where they came from', () => {
    const fields = fieldsOf([
      'M  a.txt\0R  new.md\0old.md\0?? naïve -> name.md\0 D gone.ts\0',
    ]);
    expect(changesOf(fields)).toEqual([
      { status: 'M', path: 'a.txt' },
      { status: 'R', path: 'new.md', from: 'old.md' },
      { status: '?', path: 'naïve -> name.md' },
      { status: 'D', path: 'gone.ts' },
    ]);
  });

  test('a name with a line break, split into lines on the way, is whole', () => {
    expect(changesOf(fieldsOf(['A  new', 'line.txt\0']))).toEqual([
      { status: 'A', path: 'new\nline.txt' },
    ]);
  });
});

describe('filesOf', () => {
  test("reads a commit's -z name-status and numstat together", () => {
    const statuses = fieldsOf(['M\0a.ts\0R100\0old.ts\0new.ts\0A\0logo.png\0']);
    const counts = fieldsOf([
      '3\t1\ta.ts\0' + '0\t0\t\0old.ts\0new.ts\0' + '-\t-\tlogo.png\0',
    ]);
    expect(filesOf(statuses, counts)).toEqual([
      { path: 'a.ts', status: 'M', added: 3, removed: 1 },
      { path: 'new.ts', status: 'R', added: 0, removed: 0 },
      { path: 'logo.png', status: 'A', added: undefined, removed: undefined },
    ]);
  });
});

describe('parseCommit', () => {
  test('keeps a tab in the subject', () => {
    expect(parseCommit('abc1234\tNikki\t1700000000\tfix: a\tb')).toEqual({
      hash: 'abc1234',
      author: 'Nikki',
      at: 1_700_000_000_000,
      subject: 'fix: a\tb',
    });
  });
});
