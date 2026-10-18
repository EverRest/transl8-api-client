import {
  approvalControllerPublishLocaleV1,
  type PublishLocaleResponseDto,
} from '../../generated/api-client';

export type PublishArgs = {
  project: string;
  locale: string;
};

/**
 * `transl8 publish <project> <locale>` — wraps
 * `POST /projects/:projectId/locales/:locale/publish`
 * (`approvalControllerPublishLocaleV1`), the route `docs/api/quickstart.md`'s
 * own 11-call flow actually uses. Deliberately not `release.controller.ts`'s
 * `:releaseId/approve`/`:releaseId/publish` — that's a heavier, separate
 * release-object flow the quickstart doesn't exercise; see P13-01's task
 * file corrections for why this one was picked. Bulk-publishes every
 * approved translation for the locale in one call.
 */
export async function publish({
  project,
  locale,
}: PublishArgs): Promise<PublishLocaleResponseDto> {
  return approvalControllerPublishLocaleV1(project, locale);
}
