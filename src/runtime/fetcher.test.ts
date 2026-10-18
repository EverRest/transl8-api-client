import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApiClient } from './config';
import { customFetch, retryDelayMs } from './fetcher';

describe('customFetch', () => {
  beforeEach(() => {
    configureApiClient({
      baseUrl: 'https://api.example.com',
      getAuthToken: () => 'token-123',
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefixes the base URL and adds the Authorization header', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { ok: true } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await customFetch('/config/locales', { method: 'GET', headers: {} });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/config/locales',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
      }),
    );
    expect(result).toEqual({ ok: true });
  });

  it('unwraps the { success, data } envelope', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: [1, 2, 3] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const result = await customFetch('/x', { method: 'GET', headers: {} });

    expect(result).toEqual([1, 2, 3]);
  });

  it('returns undefined for a 204 response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })));

    const result = await customFetch('/x', { method: 'DELETE', headers: {} });

    expect(result).toBeUndefined();
  });

  it('throws ApiError on a non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: false,
            error: {
              code: 'PROJECT_NOT_FOUND',
              message: 'Project not found',
              details: [],
              traceId: 'trace-abc',
            },
          }),
          { status: 404, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(customFetch('/x', { method: 'GET', headers: {} })).rejects.toMatchObject({
      status: 404,
      code: 'PROJECT_NOT_FOUND',
      traceId: 'trace-abc',
    });
  });

  it('composes the correct URL for a realistic generated path against an origin-only baseUrl', async () => {
    configureApiClient({ baseUrl: 'https://api.example.com', getAuthToken: () => undefined });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: {} }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await customFetch('/api/v1/config/locales', { method: 'GET', headers: {} });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/config/locales',
      expect.anything(),
    );
  });

  it('returns a Blob for a non-JSON 2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(new Blob(['binary']), {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        }),
      ),
    );

    const result = await customFetch('/export', { method: 'GET', headers: {} });

    expect(result).toBeInstanceOf(Blob);
  });

  it('returns a Blob for an application/json attachment, without unwrapping `data`', async () => {
    const body = '{"data":"kept","other":1}';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(body, {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': 'attachment; filename="fr.json"',
          },
        }),
      ),
    );

    const result = await customFetch<Blob>('/export', { method: 'GET', headers: {} });

    expect(result).toBeInstanceOf(Blob);
    expect(await result.text()).toBe(body);
  });

  it('still throws ApiError for an application/json attachment with a non-2xx status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: false, error: { code: 'NOT_FOUND', message: 'x' } }), {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Content-Disposition': 'attachment; filename="fr.json"',
          },
        }),
      ),
    );

    await expect(customFetch('/x', { method: 'GET', headers: {} })).rejects.toMatchObject({
      code: 'NOT_FOUND',
    });
  });

  it('throws ApiError for a non-JSON, non-2xx response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<html>error</html>', {
          status: 500,
          headers: { 'Content-Type': 'text/html' },
        }),
      ),
    );

    await expect(customFetch('/x', { method: 'GET', headers: {} })).rejects.toMatchObject({
      status: 500,
    });
  });

  it('throws when a 2xx response claims application/json but the body does not parse', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('not json', {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    await expect(customFetch('/x', { method: 'GET', headers: {} })).rejects.toMatchObject({
      status: 200,
    });
  });
});

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

describe('customFetch — rate limits', () => {
  beforeEach(() => {
    configureApiClient({ baseUrl: 'https://api.example.com' });
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // jitter = 0
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('waits Retry-After seconds on 429, then returns the data', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(429, { success: false }, { 'Retry-After': '2' }))
      .mockResolvedValueOnce(json(200, { success: true, data: { ok: true } }));
    vi.stubGlobal('fetch', fetchMock);

    const pending = customFetch('/x', { method: 'GET', headers: {} });
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('reports each retry through onRetry', async () => {
    const onRetry = vi.fn();
    configureApiClient({ baseUrl: 'https://api.example.com', onRetry });
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(json(429, {}, { 'Retry-After': '2' }))
        .mockResolvedValueOnce(json(200, { data: 1 })),
    );
    const pending = customFetch('/x', { method: 'GET', headers: {} });
    await vi.advanceTimersByTimeAsync(2000);
    await pending;
    expect(onRetry).toHaveBeenCalledWith({ status: 429, waitMs: 2000, attempt: 1, max: 3 });
  });

  it('stops waiting and rejects when the signal aborts during the wait', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(429, {}, { 'Retry-After': '5' }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    const pending = customFetch('/x', { method: 'GET', headers: {}, signal: controller.signal });
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' });
    await vi.advanceTimersByTimeAsync(1000);
    controller.abort();
    await assertion;
    await vi.advanceTimersByTimeAsync(10_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('does not retry when the signal is already aborted', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(429, {}, { 'Retry-After': '1' }));
    vi.stubGlobal('fetch', fetchMock);
    const controller = new AbortController();
    controller.abort(new Error('stop'));
    await expect(
      customFetch('/x', { method: 'GET', headers: {}, signal: controller.signal }),
    ).rejects.toThrow('stop');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after 3 retries with the usual ApiError', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => json(429, { success: false }));
    vi.stubGlobal('fetch', fetchMock);

    const pending = customFetch('/x', { method: 'GET', headers: {} });
    const assertion = expect(pending).rejects.toMatchObject({ status: 429 });
    await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });

  it('retries 429 on POST (the server refused it, so it did not run)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(429, {}, { 'Retry-After': '1' }))
      .mockResolvedValueOnce(json(200, { data: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = customFetch('/x', { method: 'POST', headers: {}, body: '{}' });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toBe(1);
  });

  it('never retries a stream body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(429, {}, { 'Retry-After': '1' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(
      customFetch('/x', { method: 'POST', headers: {}, body: new ReadableStream() }),
    ).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('waits when Retry-After is 45 s (below the 60 s cap), then retries', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(429, {}, { 'Retry-After': '45' }))
      .mockResolvedValueOnce(json(200, { data: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = customFetch('/x', { method: 'GET', headers: {} });
    await vi.advanceTimersByTimeAsync(45_000);
    await expect(pending).resolves.toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not wait when Retry-After is 61 s (above the 60 s cap)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(429, {}, { 'Retry-After': '61' }));
    vi.stubGlobal('fetch', fetchMock);

    await expect(customFetch('/x', { method: 'GET', headers: {} })).rejects.toMatchObject({
      status: 429,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('never retries an async-iterable (Node Readable) body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(429, {}, { 'Retry-After': '1' }));
    vi.stubGlobal('fetch', fetchMock);
    const body = Readable.from(['a']) as unknown as RequestInit['body'];
    await expect(customFetch('/x', { method: 'POST', headers: {}, body })).rejects.toMatchObject({
      status: 429,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('ignores an exception thrown by onRetry', async () => {
    configureApiClient({
      baseUrl: 'https://api.example.com',
      onRetry: () => {
        throw new Error('logger broke');
      },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(429, {}, { 'Retry-After': '1' }))
      .mockResolvedValueOnce(json(200, { data: 1 }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = customFetch('/x', { method: 'GET', headers: {} });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toBe(1);
  });

  it('retries 503 for GET but not for POST', async () => {
    const getMock = vi
      .fn()
      .mockResolvedValueOnce(json(503, {}, { 'Retry-After': '1' }))
      .mockResolvedValueOnce(json(200, { data: 1 }));
    vi.stubGlobal('fetch', getMock);
    const pending = customFetch('/x', { method: 'GET', headers: {} });
    await vi.advanceTimersByTimeAsync(1000);
    await expect(pending).resolves.toBe(1);

    const postMock = vi.fn().mockResolvedValue(json(503, {}, { 'Retry-After': '1' }));
    vi.stubGlobal('fetch', postMock);
    await expect(customFetch('/x', { method: 'POST', headers: {} })).rejects.toMatchObject({
      status: 503,
    });
    expect(postMock).toHaveBeenCalledTimes(1);
  });

  it.each([400, 401, 404, 500])('does not retry %i', async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(json(status, {}));
    vi.stubGlobal('fetch', fetchMock);
    await expect(customFetch('/x', { method: 'GET', headers: {} })).rejects.toMatchObject({
      status,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('retryDelayMs', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });
  it('reads seconds', () => {
    expect(retryDelayMs('2', 0, 0)).toBe(2000);
  });
  it('reads an HTTP date', () => {
    const now = Date.parse('2026-10-17T10:00:00Z');
    expect(retryDelayMs('Sat, 17 Oct 2026 10:00:03 GMT', 0, now)).toBe(3000);
  });
  it('never returns a negative wait for a past date', () => {
    const now = Date.parse('2026-10-17T10:00:00Z');
    expect(retryDelayMs('Sat, 17 Oct 2026 09:00:00 GMT', 0, now)).toBe(0);
  });
  it('treats a whitespace-only Retry-After as absent', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect(retryDelayMs('  ', 0, 0)).toBe(1000);
  });
  it('falls back to 1 s, 2 s, 4 s without a header', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    expect([0, 1, 2].map((attempt) => retryDelayMs(null, attempt, 0))).toEqual([1000, 2000, 4000]);
  });
});
