import { getTranslationJob, type TranslationJobStatusDto } from '../../generated/api-client';

/** Terminal states — matches TranslationJobStatusDto's `status` union (backend/src/translation). */
const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

export type StatusArgs = {
  jobId: string;
  /** Poll until a terminal status instead of a single check. Default true — "status" implies watching a job to completion for a CLI's own doc ("wraps GET /jobs/:id polling"). */
  poll?: boolean;
  pollIntervalMs?: number;
  maxPolls?: number;
  onPoll?: (job: TranslationJobStatusDto) => void;
};

/**
 * `transl8 status <jobId>` — wraps `GET /jobs/:jobId` (`getTranslationJob`,
 * `jobs.controller.ts`'s explicit `operationId`). Polls until the job
 * reaches a terminal status rather than a single one-shot check, since the
 * task file's own wording is "wraps GET /jobs/:id polling".
 */
export async function status({
  jobId,
  poll = true,
  pollIntervalMs = 2000,
  maxPolls = 150, // ~5 minutes at the default interval
  onPoll,
}: StatusArgs): Promise<TranslationJobStatusDto> {
  for (let attempt = 0; ; attempt += 1) {
    const job = await getTranslationJob(jobId);
    onPoll?.(job);

    if (!poll || TERMINAL_STATUSES.has(job.status) || attempt >= maxPolls - 1) {
      return job;
    }

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}
