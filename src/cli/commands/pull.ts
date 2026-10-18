import {
  exportControllerDownloadExportJobV1,
  exportControllerExportV1,
  exportControllerGetExportJobV1,
  exportControllerRequestExportV1,
  type ExportControllerExportV1Params,
} from '../../generated/api-client';
import { ApiError } from '../../runtime/errors';

/**
 * The fields of the backend's `ExportJobDto` (`toExportJobDto`) that `pull`
 * reads — the generated response type is an open `{ [key: string]: unknown }`.
 * `exportStatus` is `pending | processing | completed | failed`.
 */
type ExportJob = { id: string; exportStatus: string; errorMessage?: string };

export type PullArgs = {
  project: string;
  locale: string;
  format?: string;
  /** Async-export fallback only: poll cadence and poll budget (same knobs as `status`). */
  pollIntervalMs?: number;
  maxPolls?: number;
  onPoll?: (job: ExportJob) => void;
};

/**
 * `transl8 pull <project> <locale> [--format=json]` — wraps
 * `GET /projects/:projectId/export` (sync export, already used by
 * `docs/api/quickstart.md`'s own walkthrough). Returns the raw exported file
 * body (shape depends on `format`) for the caller to write to stdout/a file.
 *
 * The generated `ExportControllerExportV1Params` type declares `language`/
 * `status`/`keyPrefix` as required, but the real backend route
 * (`export.controller.ts`) treats all three as optional query params with
 * server-side defaults — passing `undefined` is safe at runtime (the
 * generated URL-builder already filters `undefined` out of the querystring)
 * and the cast below just bridges that generation gap, not a real API
 * behavior change.
 *
 * Over the sync row limit the backend answers 413 `EXPORT_TOO_LARGE`
 * (gap 073); `pull` then falls back to `POST /projects/:id/exports`, polls
 * `GET /exports/:id` until the job completes and downloads it. That fallback
 * needs the `exports:write` scope (the sync route only `exports:read`); on a
 * 403 the original 413 is rethrown with a note naming the scope.
 */
export async function pull({
  project,
  locale,
  format,
  pollIntervalMs = 2000,
  maxPolls = 150, // ~5 minutes at the default interval, like `status`
  onPoll,
}: PullArgs): Promise<Blob> {
  const params = {
    format: format ?? 'json',
    language: locale,
    status: undefined,
    keyPrefix: undefined,
  } as unknown as ExportControllerExportV1Params;

  let tooLarge: ApiError;
  try {
    return await exportControllerExportV1(project, params);
  } catch (error) {
    if (!(error instanceof ApiError) || error.code !== 'EXPORT_TOO_LARGE') {
      throw error;
    }
    tooLarge = error;
  }

  let job: ExportJob;
  try {
    job = (await exportControllerRequestExportV1(project, {
      format: params.format,
      language: locale,
    })) as ExportJob;
  } catch (error) {
    // Starting an export job needs `exports:write`; the sync route only
    // `exports:read`. A read-only key would otherwise see an opaque 403.
    if (error instanceof ApiError && error.status === 403) {
      throw new ApiError(
        `${tooLarge.message} — too large for the sync export; the async fallback needs an API key with the exports:write scope`,
        tooLarge.status,
        { code: tooLarge.code, traceId: error.traceId, details: tooLarge.details },
      );
    }
    throw error;
  }
  for (let polls = 0; ; polls += 1) {
    onPoll?.(job);
    if (job.exportStatus === 'completed') {
      return exportControllerDownloadExportJobV1(job.id);
    }
    if (job.exportStatus === 'failed') {
      throw new Error(
        `export job ${job.id} failed${job.errorMessage ? `: ${job.errorMessage}` : ''}`,
      );
    }
    if (polls >= maxPolls) {
      throw new Error(
        `export job ${job.id} still ${job.exportStatus} after ${maxPolls} polls`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    job = (await exportControllerGetExportJobV1(job.id)) as ExportJob;
  }
}
