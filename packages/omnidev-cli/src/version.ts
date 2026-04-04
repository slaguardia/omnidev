/**
 * Single source of truth: `packages/omnidev-cli/package.json` → `version` field.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));
const pkgPath = join(dir, '..', 'package.json');

export const CLI_VERSION: string = (
  JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string }
).version;
