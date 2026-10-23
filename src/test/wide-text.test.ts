import { describe, expect, test } from 'bun:test';

import { splitWide } from '@/lib/wide-text';

describe('splitWide', () => {
  test('leaves text without wide characters whole', () => {
    expect(splitWide('│ logs/boost.ts │ ─┼─ │')).toEqual([
      { text: '│ logs/boost.ts │ ─┼─ │' },
    ]);
  });

  test('splits out an emoji as a terminal draws it, two cells', () => {
    expect(splitWide('│ ✅    │')).toEqual([
      { text: '│ ' },
      { text: '✅', wide: true },
      { text: '    │' },
    ]);
  });

  test('keeps text-style symbols one cell', () => {
    expect(splitWide('✔ © ☑')).toEqual([{ text: '✔ © ☑' }]);
  });

  test('takes a symbol asked to be an emoji as wide', () => {
    expect(splitWide('☑️x')).toEqual([
      { text: '☑️', wide: true },
      { text: 'x' },
    ]);
  });

  test('keeps a joined emoji and its skin tone together', () => {
    expect(splitWide('👩🏽‍💻!')).toEqual([
      { text: '👩🏽‍💻', wide: true },
      { text: '!' },
    ]);
  });

  test('splits CJK characters one at a time', () => {
    expect(splitWide('日本')).toEqual([
      { text: '日', wide: true },
      { text: '本', wide: true },
    ]);
  });
});
