import {
  getImportControllerCreateFromFileV1Url,
  importControllerApplyV1,
  type ImportSessionApplyQueuedResponseDto,
  type ImportSessionApplySyncResponseDto,
  type ImportSessionCreateResponseDto,
} from '../../generated/api-client';
import { customFetch } from '../../runtime/fetcher';

export type PushArgs = {
  project: string;
  fileContents: Blob;
  fileName: string;
};

export type PushResult =
  | ImportSessionApplyQueuedResponseDto
  | ImportSessionApplySyncResponseDto;

/**
 * `transl8 push <file> --project=<project>` — wraps the same two-call
 * session flow the dashboard's import UI uses: create an import session from
 * an uploaded file, then apply it.
 *
 * Deliberately does **not** call the generated `importControllerCreateFromFileV1`:
 * that function's `FormData` only appends `parseRulesJson` — `CreateImportFileDto`
 * has no `file` field (the real route takes the file via `@UploadedFile()` +
 * `FileInterceptor('file')`, outside the DTO, and the controller has no
 * `@ApiBody` declaring that binary field for orval to see). Generating
 * against the current OpenAPI snapshot genuinely cannot produce a working
 * upload call — this is a contract-generation gap this task found, not
 * something P13-01 asked to fix (that's a separate `@ApiBody` annotation on
 * `import.controller.ts`, needing a live regen — out of this task's scope).
 * This function instead builds the multipart body by hand, matching what
 * the real backend route actually requires, and still goes through
 * `customFetch` for auth/error-envelope handling.
 */
export async function push({
  project,
  fileContents,
  fileName,
}: PushArgs): Promise<PushResult> {
  const formData = new FormData();
  formData.append('file', fileContents, fileName);

  const session = await customFetch<ImportSessionCreateResponseDto>(
    getImportControllerCreateFromFileV1Url(project),
    { method: 'POST', body: formData },
  );

  return importControllerApplyV1(project, session.id, {});
}
