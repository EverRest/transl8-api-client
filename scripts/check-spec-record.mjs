#!/usr/bin/env node
// Fails when openapi.json was edited by hand: its sha256 must equal the one in
// openapi.source.json (written by sync-openapi).
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const actual = createHash('sha256')
  .update(readFileSync(join(root, 'openapi.json')))
  .digest('hex');
const { specSha256 } = JSON.parse(readFileSync(join(root, 'openapi.source.json'), 'utf8'));
if (actual !== specSha256) {
  console.error(
    `check-spec-record: openapi.json sha256 ${actual} does not match openapi.source.json ${specSha256}. Run scripts/sync-openapi.mjs; never edit openapi.json by hand.`,
  );
  process.exit(1);
}
console.log('check-spec-record: ok');
