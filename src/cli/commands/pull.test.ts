import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApiClient } from '../../runtime/config';
import { pull } from './pull';

describe('pull', () => {
  beforeEach(() => {
    configureApiClient({ baseUrl: 'https://api.example.com', getAuthToken: () => 'ta_live_x' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GETs /projects/:projectId/export with format and language', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{"key":"value"}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await pull({ project: 'my-project', locale: 'fr', format: 'json' });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe(
      'https://api.example.com/api/v1/projects/my-project/export?format=json&language=fr',
    );
  });

  it('returns the raw body of a JSON export served as an attachment (the real backend headers)', async () => {
    const body = '{"data":"kept","greeting":"salut"}';
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

    const blob = await pull({ project: 'p', locale: 'fr', format: 'json' });

    expect(await blob.text()).toBe(body);
  });

  it('defaults format to json when not given', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await pull({ project: 'p', locale: 'de' });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toContain('format=json');
  });

  it('returns the raw exported body as a Blob', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('{"fr":"Bonjour"}', {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        }),
      ),
    );

    const result = await pull({ project: 'p', locale: 'fr' });

    expect(result).toBeInstanceOf(Blob);
    expect(await result.text()).toBe('{"fr":"Bonjour"}');
  });

  describe('async export fallback (gap 073)', () => {
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    const tooLarge = () =>
      json(413, {
        success: false,
        error: { code: 'EXPORT_TOO_LARGE', message: 'Export has 1500 rows' },
      });
    const job = (exportStatus: string, extra: Record<string, unknown> = {}) =>
      json(200, { success: true, data: { id: 'job1', exportStatus, ...extra } });
    const file = () =>
      new Response('{"fr":"Bonjour"}', {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' },
      });
    const calls = (fetchMock: ReturnType<typeof vi.fn>) =>
      fetchMock.mock.calls.map(([url, init]) => `${init?.method ?? 'GET'} ${url}`);

    it('on EXPORT_TOO_LARGE requests an async export, polls it and downloads the file', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(tooLarge())
        .mockResolvedValueOnce(job('pending'))
        .mockResolvedValueOnce(job('processing'))
        .mockResolvedValueOnce(job('completed'))
        .mockResolvedValueOnce(file());
      vi.stubGlobal('fetch', fetchMock);
      const onPoll = vi.fn();

      const result = await pull({
        project: 'p',
        locale: 'fr',
        format: 'json',
        pollIntervalMs: 0,
        onPoll,
      });

      expect(calls(fetchMock)).toEqual([
        'GET https://api.example.com/api/v1/projects/p/export?format=json&language=fr',
        'POST https://api.example.com/api/v1/projects/p/exports',
        'GET https://api.example.com/api/v1/exports/job1',
        'GET https://api.example.com/api/v1/exports/job1',
        'GET https://api.example.com/api/v1/exports/job1/download',
      ]);
      expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({
        format: 'json',
        language: 'fr',
      });
      expect(onPoll).toHaveBeenCalledTimes(3);
      expect(await result.text()).toBe('{"fr":"Bonjour"}');
    });

    it('downloads straight away when the requested job is already completed', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(tooLarge())
        .mockResolvedValueOnce(job('completed'))
        .mockResolvedValueOnce(file());
      vi.stubGlobal('fetch', fetchMock);

      await pull({ project: 'p', locale: 'fr', pollIntervalMs: 0 });

      expect(calls(fetchMock).slice(1)).toEqual([
        'POST https://api.example.com/api/v1/projects/p/exports',
        'GET https://api.example.com/api/v1/exports/job1/download',
      ]);
    });

    it('fails with the job errorMessage when the export job failed', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(tooLarge())
        .mockResolvedValueOnce(job('pending'))
        .mockResolvedValueOnce(job('failed', { errorMessage: 'render blew up' }));
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        pull({ project: 'p', locale: 'fr', pollIntervalMs: 0 }),
      ).rejects.toThrow(/job1.*failed.*render blew up/);
      expect(calls(fetchMock).some((c) => c.endsWith('/download'))).toBe(false);
    });

    it('fails clearly when the export job does not finish within maxPolls', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(tooLarge())
        .mockResolvedValueOnce(job('pending'))
        .mockImplementation(async () => job('processing'));
      vi.stubGlobal('fetch', fetchMock);

      await expect(
        pull({ project: 'p', locale: 'fr', pollIntervalMs: 0, maxPolls: 3 }),
      ).rejects.toThrow(/job1.*processing.*3 polls/);
      expect(calls(fetchMock).some((c) => c.endsWith('/download'))).toBe(false);
    });

    it('keeps the 413 message and names the exports:write scope when a read-only key gets 403 on the async request', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(tooLarge())
        .mockResolvedValueOnce(
          json(403, {
            success: false,
            error: { code: 'FORBIDDEN_SCOPE', message: 'Forbidden', traceId: 't-1' },
          }),
        );
      vi.stubGlobal('fetch', fetchMock);

      const error = await pull({ project: 'p', locale: 'fr' }).catch((e) => e);

      expect(error).toMatchObject({ status: 413, code: 'EXPORT_TOO_LARGE', traceId: 't-1' });
      expect(error.message).toContain('Export has 1500 rows');
      expect(error.message).toContain('exports:write');
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('rethrows other API errors without requesting an async export', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          json(404, { success: false, error: { code: 'NOT_FOUND', message: 'no project' } }),
        );
      vi.stubGlobal('fetch', fetchMock);

      await expect(pull({ project: 'p', locale: 'fr' })).rejects.toMatchObject({
        code: 'NOT_FOUND',
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
