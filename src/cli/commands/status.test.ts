import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { configureApiClient } from '../../runtime/config';
import { status } from './status';

function jobResponse(status: string) {
  return new Response(
    JSON.stringify({ success: true, data: { id: 'job_1', status } }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

describe('status', () => {
  beforeEach(() => {
    configureApiClient({ baseUrl: 'https://api.example.com', getAuthToken: () => 'k' });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GETs /jobs/:jobId', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jobResponse('completed'));
    vi.stubGlobal('fetch', fetchMock);

    await status({ jobId: 'job_1' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/jobs/job_1',
      expect.anything(),
    );
  });

  it('returns immediately on a terminal status without polling again', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jobResponse('failed'));
    vi.stubGlobal('fetch', fetchMock);

    const job = await status({ jobId: 'job_1', pollIntervalMs: 0 });

    expect(job.status).toBe('failed');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('polls until a terminal status is reached', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jobResponse('pending'))
      .mockResolvedValueOnce(jobResponse('processing'))
      .mockResolvedValueOnce(jobResponse('completed'));
    vi.stubGlobal('fetch', fetchMock);

    const job = await status({ jobId: 'job_1', pollIntervalMs: 0 });

    expect(job.status).toBe('completed');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('calls onPoll with every intermediate job snapshot', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jobResponse('pending'))
      .mockResolvedValueOnce(jobResponse('completed'));
    vi.stubGlobal('fetch', fetchMock);
    const onPoll = vi.fn();

    await status({ jobId: 'job_1', pollIntervalMs: 0, onPoll });

    expect(onPoll).toHaveBeenCalledTimes(2);
    expect(onPoll.mock.calls[0][0].status).toBe('pending');
    expect(onPoll.mock.calls[1][0].status).toBe('completed');
  });

  it('does not poll a second time when poll: false', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jobResponse('pending'));
    vi.stubGlobal('fetch', fetchMock);

    const job = await status({ jobId: 'job_1', poll: false });

    expect(job.status).toBe('pending');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after maxPolls even if the job never reaches a terminal status', async () => {
    // A fresh Response per call — Response bodies can only be read once, and
    // reusing one instance across repeated polls would fail the second read.
    const fetchMock = vi.fn().mockImplementation(async () => jobResponse('processing'));
    vi.stubGlobal('fetch', fetchMock);

    const job = await status({ jobId: 'job_1', pollIntervalMs: 0, maxPolls: 3 });

    expect(job.status).toBe('processing');
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
