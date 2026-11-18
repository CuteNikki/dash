import 'server-only';

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * The build this server runs, as Next named it, read once. A page compares
 * it with the build it came from, to reload after the dashboard's updated
 * rather than call actions the new build doesn't have. Read once, so a
 * build made while development runs doesn't change it; empty with none.
 */
export const BUILD_ID = (() => {
  try {
    return readFileSync(
      join(process.cwd(), '.next', 'BUILD_ID'),
      'utf8'
    ).trim();
  } catch {
    return '';
  }
})();
