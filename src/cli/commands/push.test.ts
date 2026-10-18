import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApiClient } from '../../runtime/config';
import { push } from './push';

describe('push', () => {
  beforeEach(() => {
    configureApiClient({ baseUrl: 'https://api.example.com', getAuthToken: () => 'k' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function mockTwoStepFlow() {
    const fetchMock = vi.fn();
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ success: true, data: { id: 'session_1', status: 'ready' } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ success: true, data: { appliedCount: 3 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  it('creates an import session with the file as multipart form data', async () => {
    const fetchMock = mockTwoStepFlow();

    await push({
      project: 'my-project',
      fileContents: new Blob(['fr: {}'], { type: 'application/json' }),
      fileName: 'fr.json',
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.example.com/api/v1/projects/my-project/import/sessions');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(FormData);
    expect(init.body.get('file')).toBeInstanceOf(Blob);
  });

  it('applies the created session in a second call', async () => {
    const fetchMock = mockTwoStepFlow();

    const result = await push({
      project: 'my-project',
      fileContents: new Blob(['fr: {}']),
      fileName: 'fr.json',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/projects/my-project/import/sessions/session_1/apply',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result).toEqual({ appliedCount: 3 });
  });

  it('sends the auth header on the hand-built multipart call too, not just the generated one', async () => {
    const fetchMock = mockTwoStepFlow();

    await push({
      project: 'p',
      fileContents: new Blob(['x']),
      fileName: 'x.json',
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.Authorization).toBe('Bearer k');
  });
});
