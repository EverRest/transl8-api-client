import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const pkg = JSON.parse(
  readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', 'package.json'),
    'utf8',
  ),
) as {
  name: string;
  bin?: Record<string, string>;
  publishConfig?: { registry?: string; access?: string };
  repository?: { url?: string };
};

describe('published package identity (P17-02 / D1)', () => {
  it('is @transl8.ai/api-client on the public npm registry', () => {
    expect(pkg.name).toBe('@transl8.ai/api-client');
    expect(pkg.publishConfig).toEqual({
      registry: 'https://registry.npmjs.org',
      access: 'public',
    });
  });

  it('exposes the transl8 CLI via dist/cli.js (npm rejects bin/*.mjs on publish)', () => {
    // No leading `./`: npm 11 warned `"bin[transl8]" ... was invalid and removed`
    // for `./dist/cli.js` when it published (2.1.0 publish log, 2026-10-18).
    expect(pkg.bin).toEqual({ transl8: 'dist/cli.js' });
  });

  it('declares the GitHub repo npm trusted publishing matches against', () => {
    expect(pkg.repository?.url).toBe(
      'git+https://github.com/EverRest/transl8-api-client.git',
    );
  });
});
