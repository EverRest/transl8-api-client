import { getApiClientConfig } from './config';
import { parseApiErrorBody } from './errors';

const MAX_RETRIES = 3;
// The backend's fixed windows are 60 s and Retry-After is spread over 1..60.
const MAX_WAIT_MS = 60_000;

/**
 * How long to wait before the next attempt. `Retry-After` is delta-seconds or
 * an HTTP date (RFC 9110 10.2.3). Without it: 1 s, 2 s, 4 s with +-20% jitter,
 * so parallel CI jobs do not retry in step.
 */
export function retryDelayMs(
  retryAfter: string | null,
  attempt: number,
  now = Date.now(),
): number {
  const header = retryAfter?.trim();
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
    const date = Date.parse(header);
    if (!Number.isNaN(date)) return Math.max(0, date - now);
  }
  return Math.round(1000 * 2 ** attempt * (0.8 + Math.random() * 0.4));
}

// 429: the server refused the request, so retrying cannot apply it twice.
// 503: only for safe methods, a POST may have partly run.
function isRetryable(status: number, method: string, body: RequestInit['body']): boolean {
  if (body instanceof ReadableStream) return false;
  // A Node Readable / async iterable is consumed by the first attempt.
  if (
    body &&
    typeof body === 'object' &&
    Symbol.asyncIterator in body &&
    !(body instanceof Blob)
  ) {
    return false;
  }
  if (status === 429) return true;
  return status === 503 && (method === 'GET' || method === 'HEAD');
}

// Resolves after `ms`; rejects with the signal's reason if it aborts first.
function sleep(ms: number, signal?: AbortSignal | null): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * orval's `client: 'fetch'` output calls this with the request PATH (not a
 * full URL) — orval.config.ts intentionally omits `output.baseUrl` so the
 * base URL stays a runtime concern, resolved per-consumer via
 * `configureApiClient()` instead of being baked in at generation time.
 */
export const customFetch = async <T>(
  url: string,
  options: RequestInit,
): Promise<T> => {
  const { baseUrl, getAuthToken, onRetry } = getApiClientConfig();
  const token = getAuthToken?.();

  const method = (options.method ?? 'GET').toUpperCase();
  const target = `${baseUrl.replace(/\/$/, '')}${url}`;
  const init: RequestInit = {
    ...options,
    headers: {
      ...options.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  };

  let response = await fetch(target, init);
  for (
    let attempt = 0;
    attempt < MAX_RETRIES && isRetryable(response.status, method, options.body);
    attempt += 1
  ) {
    const wait = retryDelayMs(response.headers.get('retry-after'), attempt);
    if (options.signal?.aborted) throw options.signal.reason;
    if (wait > MAX_WAIT_MS) break; // a CI job must not hang; the error says why
    await response.body?.cancel(); // free the socket before waiting
    try {
      onRetry?.({ status: response.status, waitMs: wait, attempt: attempt + 1, max: MAX_RETRIES });
    } catch {
      // a broken logger must not replace the response / ApiError flow
    }
    await sleep(wait, options.signal);
    response = await fetch(target, init);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  // A file download (`Content-Disposition: attachment`, e.g. a JSON export the
  // backend serves as application/json) is the raw body, not an API envelope:
  // hand it back as a Blob instead of parsing it and unwrapping a `data` key.
  // Errors still go through the JSON envelope path below.
  const isAttachment = /^\s*attachment\b/i.test(
    response.headers.get('content-disposition') ?? '',
  );
  const contentType = response.headers.get('content-type') ?? '';
  if (response.ok && isAttachment) {
    return response.blob() as T;
  }
  if (!contentType.includes('application/json')) {
    if (!response.ok) {
      throw parseApiErrorBody(response.status, undefined);
    }
    return response.blob() as T;
  }

  const body = await response.json().catch(() => undefined);

  if (!response.ok) {
    throw parseApiErrorBody(response.status, body);
  }

  if (body === undefined) {
    // A 2xx response claiming application/json whose body didn't actually
    // parse — surface it as an error instead of silently resolving nothing.
    throw parseApiErrorBody(response.status, undefined);
  }

  if (body && typeof body === 'object' && 'data' in body) {
    return (body as { data: T }).data;
  }
  return body as T;
};
