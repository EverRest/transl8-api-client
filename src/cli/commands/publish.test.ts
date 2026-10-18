import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApiClient } from '../../runtime/config';
import { publish } from './publish';

describe('publish', () => {
  beforeEach(() => {
    configureApiClient({ baseUrl: 'https://api.example.com', getAuthToken: () => 'k' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('POSTs to /projects/:projectId/locales/:locale/publish', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { publishedCount: 5 } }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await publish({ project: 'my-project', locale: 'fr' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/projects/my-project/locales/fr/publish',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(result).toEqual({ publishedCount: 5 });
  });
});
