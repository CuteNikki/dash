import { describe, expect, test } from 'bun:test';

import { listedById } from '@/lib/docker/docker';

const id =
  'sha256:f377d590e5474681d4d7838635031a2b50647923b7abfa803ce9b5ff35d5c663';

describe('listedById', () => {
  test('tells an image listed by its id, short or whole', () => {
    expect(listedById('f377d590e547', id)).toBe(true);
    expect(listedById(id, id)).toBe(true);
  });

  test('leaves an image listed by its name alone', () => {
    expect(listedById('postgres:16-alpine', id)).toBe(false);
    // A name that happens to be hex isn't this image's id
    expect(listedById('deadbeefcafe', id)).toBe(false);
  });
});
