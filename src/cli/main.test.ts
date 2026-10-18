import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { run } from './main';

/** Minimal writable that records what was written, mirroring process.stdout/stderr's write() shape. */
function recorder() {
  const chunks: (string | Uint8Array)[] = [];
  return {
    write: (chunk: string | Uint8Array) => {
      chunks.push(chunk);
    },
    text: () =>
      chunks
        .map((c) => (typeof c === 'string' ? c : Buffer.from(c).toString('utf8')))
        .join(''),
  };
}

function baseIo(
  argv: string[],
  overrides: { env?: NodeJS.ProcessEnv; readFile?: (path: string) => Promise<Uint8Array> } = {},
) {
  return {
    argv,
    env: overrides.env ?? {
      TRANSL8_API_KEY: 'ta_live_test',
      TRANSL8_API_BASE_URL: 'https://api.example.test',
    },
    stdout: recorder(),
    stderr: recorder(),
    readFile: overrides.readFile ?? vi.fn(),
  };
}

describe('run', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prints help and exits 1 when given no command', async () => {
    const io = baseIo([]);
    const code = await run(io);

    expect(code).toBe(1);
    expect(io.stdout.text()).toContain('Usage:');
  });

  it('prints help and exits 0 on --help', async () => {
    const io = baseIo(['--help']);
    const code = await run(io);

    expect(code).toBe(0);
    expect(io.stdout.text()).toContain('Usage:');
    expect(io.stdout.text()).toContain('@transl8.ai/api-client');
  });

  it('prints help and exits 0 on --help and -h with no host, naming no host', async () => {
    for (const flag of ['--help', '-h']) {
      const io = baseIo([flag], { env: {} });
      expect(await run(io)).toBe(0);
      expect(io.stdout.text()).not.toMatch(/api\.transl8\.ai/);
    }
  });

  describe('without an API host', () => {
    const MESSAGE =
      'transl8: set --api-base-url or TRANSL8_API_BASE_URL (the API host, for example https://api.example.com)\n';
    const commands = [
      ['pull', 'p', 'fr'],
      ['push', 'fr.json', '--project=p'],
      ['status', 'job_1'],
      ['publish', 'p', 'fr'],
    ];

    it.each(commands)('%s exits 1 with the message and makes no request', async (...argv) => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const readFile = vi.fn();
      const io = baseIo(argv, { env: { TRANSL8_API_KEY: 'ta_live_test' }, readFile });

      expect(await run(io)).toBe(1);
      expect(io.stderr.text()).toBe(MESSAGE);
      expect(fetchMock).not.toHaveBeenCalled();
      expect(readFile).not.toHaveBeenCalled();
    });

    it('treats empty --api-base-url and empty env as not set', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      for (const [argv, env] of [
        [['pull', 'p', 'fr', '--api-base-url='], { TRANSL8_API_KEY: 'k' }],
        [['pull', 'p', 'fr'], { TRANSL8_API_KEY: 'k', TRANSL8_API_BASE_URL: '' }],
      ] as const) {
        const io = baseIo([...argv], { env });
        expect(await run(io)).toBe(1);
        expect(io.stderr.text()).toBe(MESSAGE);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('reports the missing API key before the missing host', async () => {
      const io = baseIo(['pull', 'p', 'fr'], { env: {} });
      expect(await run(io)).toBe(1);
      expect(io.stderr.text()).toContain('API key');
    });

    it('works when only --api-base-url is given', async () => {
      const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);
      const io = baseIo(['pull', 'p', 'fr', '--api-base-url=https://flag.test'], {
        env: { TRANSL8_API_KEY: 'k' },
      });
      expect(await run(io)).toBe(0);
      expect(String(fetchMock.mock.calls[0][0])).toMatch(/^https:\/\/flag\.test\/api\/v1\//);
    });
  });

  it('exits 1 with a clear message when no API key is available', async () => {
    const io = baseIo(['pull', 'p', 'fr'], { env: {} });
    const code = await run(io);

    expect(code).toBe(1);
    expect(io.stderr.text()).toContain('API key');
  });

  it('exits 1 on an unknown command', async () => {
    const io = baseIo(['frobnicate']);
    const code = await run(io);

    expect(code).toBe(1);
    expect(io.stderr.text()).toContain('unknown command');
  });

  it('exits 1 with usage text when pull is missing its locale', async () => {
    const io = baseIo(['pull', 'my-project']);
    const code = await run(io);

    expect(code).toBe(1);
    expect(io.stderr.text()).toContain('transl8 pull <project> <locale>');
  });

  it('exits 1 with usage text when push is missing --project', async () => {
    const io = baseIo(['push', 'fr.json']);
    const code = await run(io);

    expect(code).toBe(1);
    expect(io.stderr.text()).toContain('transl8 push <file> --project=<project>');
  });

  it('exits 1 with usage text when status is missing a jobId', async () => {
    const io = baseIo(['status']);
    const code = await run(io);

    expect(code).toBe(1);
    expect(io.stderr.text()).toContain('transl8 status <jobId>');
  });

  it('exits 1 with usage text when publish is missing its locale', async () => {
    const io = baseIo(['publish', 'my-project']);
    const code = await run(io);

    expect(code).toBe(1);
    expect(io.stderr.text()).toContain('transl8 publish <project> <locale>');
  });

  it('runs pull end to end and writes the raw body to stdout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{"fr":"Bonjour"}', {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        }),
      ),
    );
    const io = baseIo(['pull', 'my-project', 'fr']);

    const code = await run(io);

    expect(code).toBe(0);
    expect(io.stdout.text()).toBe('{"fr":"Bonjour"}');
  });

  it('runs status end to end, reporting progress on stderr and the final job on stdout', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ success: true, data: { id: 'job_1', status: 'completed' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const io = baseIo(['status', 'job_1']);

    const code = await run(io);

    expect(code).toBe(0);
    expect(io.stderr.text()).toContain('job_1 — completed');
    expect(JSON.parse(io.stdout.text())).toEqual({ id: 'job_1', status: 'completed' });
  });

  it('runs publish end to end', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: { publishedCount: 1 } }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );
    const io = baseIo(['publish', 'my-project', 'fr']);

    const code = await run(io);

    expect(code).toBe(0);
    expect(JSON.parse(io.stdout.text())).toEqual({ publishedCount: 1 });
  });

  it('runs push end to end, reading the file through the injected readFile', async () => {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: { id: 'session_1' } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: { appliedCount: 2 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const readFile = vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3]));
    const io = baseIo(['push', 'fr.json', '--project=my-project'], { readFile });

    const code = await run(io);

    expect(code).toBe(0);
    expect(readFile).toHaveBeenCalledWith('fr.json');
    expect(JSON.parse(io.stdout.text())).toEqual({ appliedCount: 2 });
  });

  it('exits 1 and reports the API error without a stack trace when a call fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            error: { code: 'PROJECT_NOT_FOUND', message: 'Project not found', traceId: 't1' },
          }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    const io = baseIo(['publish', 'missing-project', 'fr']);

    const code = await run(io);

    expect(code).toBe(1);
    expect(io.stderr.text()).toContain('Project not found');
    expect(io.stderr.text()).toContain('PROJECT_NOT_FOUND');
  });
});
