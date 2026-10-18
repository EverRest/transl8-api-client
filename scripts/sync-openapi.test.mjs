import { execFile } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

const script = join(import.meta.dirname, 'sync-openapi.mjs');

const enveloped = {
  openapi: '3.0.0',
  info: { title: 't', version: '1' },
  paths: {
    '/a': {
      get: {
        responses: {
          200: {
            content: {
              'application/json': {
                schema: {
                  properties: { success: { type: 'boolean' }, data: { type: 'string' } },
                },
              },
            },
          },
        },
      },
    },
  },
};

let server;
let host;
let status;
let out;

beforeAll(async () => {
  server = createServer((req, res) => {
    const bodies = {
      '/api/v1/docs-json': enveloped,
      '/api/versions': { latest: '1', defaultVersion: '1', versions: [] },
      '/api/v1/health/version': { version: '9.9.9' },
    };
    const body = bodies[req.url];
    res.statusCode = body ? status : 404;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body ?? {}));
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  host = `http://127.0.0.1:${server.address().port}`;
});
afterAll(() => server.close());
beforeEach(() => {
  status = 200;
  out = mkdtempSync(join(tmpdir(), 'sync-openapi-'));
  return () => rmSync(out, { recursive: true, force: true });
});

function run(args, env = {}) {
  return new Promise((resolve) => {
    execFile(
      'node',
      [script, '--out', out, ...args],
      { env: { ...process.env, TRANSL8_SPEC_URL: '', ...env } },
      (error, stdout, stderr) =>
        resolve({ code: error ? error.code : 0, stdout, stderr }),
    );
  });
}

const read = (name) => readFileSync(join(out, name), 'utf8');

describe('sync-openapi', () => {
  it('writes the stripped spec and the record', async () => {
    const r = await run(['--from', host]);
    expect(r.code).toBe(0);
    const spec = JSON.parse(read('openapi.json'));
    expect(spec.paths['/a'].get.responses[200].content['application/json'].schema).toEqual({
      type: 'string',
    });
    const record = JSON.parse(read('openapi.source.json'));
    expect(record.backendVersion).toBe('9.9.9');
    expect(record.apiVersion).toBe('1');
    expect(record.specSha256).toBe(
      createHash('sha256').update(read('openapi.json')).digest('hex'),
    );
    expect(new Date(record.fetchedAt).toISOString()).toBe(record.fetchedAt);
  });

  it('reads the host from TRANSL8_SPEC_URL', async () => {
    expect((await run([], { TRANSL8_SPEC_URL: host })).code).toBe(0);
  });

  it('a second run changes nothing but fetchedAt', async () => {
    await run(['--from', host]);
    const spec1 = read('openapi.json');
    const rec1 = JSON.parse(read('openapi.source.json'));
    await new Promise((r) => setTimeout(r, 15));
    await run(['--from', host]);
    expect(read('openapi.json')).toBe(spec1);
    const { fetchedAt: t1, ...rest1 } = rec1;
    const { fetchedAt: t2, ...rest2 } = JSON.parse(read('openapi.source.json'));
    expect(rest2).toEqual(rest1);
    expect(t2 >= t1).toBe(true);
  });

  it('exits 1 on a non-200 and keeps the old files', async () => {
    writeFileSync(join(out, 'openapi.json'), 'old\n');
    writeFileSync(join(out, 'openapi.source.json'), 'old-record\n');
    status = 500;
    const r = await run(['--from', host]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('500');
    expect(read('openapi.json')).toBe('old\n');
    expect(read('openapi.source.json')).toBe('old-record\n');
  });

  it('exits 1 without a host', async () => {
    const r = await run([]);
    expect(r.code).toBe(1);
    expect(r.stderr).toContain('--from');
    expect(existsSync(join(out, 'openapi.json'))).toBe(false);
  });
});
