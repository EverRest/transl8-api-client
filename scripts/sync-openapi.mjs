#!/usr/bin/env node
/**
 * Fetch the OpenAPI spec from a running transl8.ai backend and write
 * openapi.json (the input of `npm run generate`) plus openapi.source.json
 * (where the spec came from).
 *
 *   node scripts/sync-openapi.mjs --from https://your-transl8-host
 *   TRANSL8_SPEC_URL=https://your-transl8-host node scripts/sync-openapi.mjs
 *
 * There is no default host. Give the host only, without /api/v1.
 * Nothing is written unless all three requests succeed.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripEnvelope } from './strip-envelope.mjs';

function fail(message) {
  console.error(`sync-openapi: ${message}`);
  process.exit(1);
}

function option(name) {
  const i = process.argv.indexOf(name);
  return i === -1 ? undefined : process.argv[i + 1];
}

const host = (option('--from') || process.env.TRANSL8_SPEC_URL || '').replace(/\/+$/, '');
if (!host) {
  fail('set --from <host> or TRANSL8_SPEC_URL (the API host, for example https://api.example.com)');
}
const outDir =
  option('--out') || dirname(dirname(fileURLToPath(import.meta.url)));

async function getJson(path) {
  let response;
  try {
    response = await fetch(host + path);
  } catch (error) {
    fail(`GET ${host}${path} failed: ${error.message}`);
  }
  if (response.status !== 200) {
    fail(`GET ${host}${path} returned ${response.status}, expected 200`);
  }
  return response.json();
}

const raw = await getJson('/api/v1/docs-json');
const versions = await getJson('/api/versions');
const app = await getJson('/api/v1/health/version');

const specText = JSON.stringify(stripEnvelope(raw), null, 2) + '\n';
const record = {
  backendVersion: app.version,
  apiVersion: versions.latest,
  fetchedAt: new Date().toISOString(),
  // Hash of openapi.json only. fetchedAt is not part of it.
  specSha256: createHash('sha256').update(specText).digest('hex'),
};

mkdirSync(outDir, { recursive: true });
for (const [name, text] of [
  ['openapi.json', specText],
  ['openapi.source.json', JSON.stringify(record, null, 2) + '\n'],
]) {
  const tmp = join(outDir, `.${name}.tmp`);
  writeFileSync(tmp, text);
  renameSync(tmp, join(outDir, name));
}
console.log(`Wrote openapi.json and openapi.source.json (backend ${record.backendVersion})`);
