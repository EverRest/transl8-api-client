# `@transl8.ai/api-client` changelog

## 2.1.1 — 2026-10-18 — First release from the public repository

- **Changed:** the source moved to the public repository EverRest/transl8-api-client. The package is now built, tested and published by that repository's CI with npm trusted publishing and provenance. No code change.

## 2.1.0 — 2026-10-17 — Retry on rate limits

- **Added:** `customFetch` retries a `429` (all methods) and a `503` (`GET`/`HEAD`) up to 3 times. It waits for `Retry-After` (seconds or HTTP date), or 1 s, 2 s, 4 s with jitter. A wait above 60 s is not done: the error comes back at once. A stream body is never retried. The CLI prints one line to stderr per retry. New optional config `onRetry`. No breaking change: after the last attempt the error is the same `ApiError`.
- **Changed:** regenerated with orval 8.43.0 (header helper updated). No API change: `openapi.json` is unchanged.
- **Fixed:** the `bin` path is `dist/cli.js`, without a leading `./`. npm 11 warned `"bin[transl8]" ... was invalid and removed` for the old form when it published, so the package could have shipped without the `transl8` command. `cli-e2e` now fails if the path starts with `./` or the packed `package.json` has no `bin.transl8`.

## 2.0.1 — 2026-10-16

- **Changed:** `package.json` has a `description` and `keywords`. The README warns: never run `npx transl8` without `-p`, because another npm package has the name `transl8`. No code change. This is the first release published by GitHub Actions with npm trusted publishing.

## 2.0.0 — 2026-10-16

- **Changed:** the CLI has no default API host. Set `--api-base-url` or `TRANSL8_API_BASE_URL`. The old default `https://api.transl8.ai` does not exist.

- **Fixed:** `transl8 pull … | jq` (any pipe, on macOS) no longer truncates an export at 64 KB with
  exit code 0. `dist/cli.js` called `process.exit()` right after the single stdout write, and Node
  writes to a pipe asynchronously there; it now sets `process.exitCode` and lets the loop drain.
  `cli-e2e` pipes a 5 MB export from a local server through the packed bin. **Version deliberately
  not bumped** (stays **2.0.0**).

- **Fixed:** `transl8 pull` of a locale over 1000 rows with a read-only (`exports:read`) key now
  reports the original `EXPORT_TOO_LARGE` message plus a note that the async fallback needs the
  `exports:write` scope, instead of an opaque 403 from `POST /projects/{id}/exports`. Scope
  documented in `--help`, the GitLab template and the Action's `api-key` input. **Version
  deliberately not bumped** (stays **2.0.0**).

- **Fixed:** `transl8 pull --format=json` (and the GitHub Action / GitLab template built on it) no
  longer breaks against a real backend. The backend serves JSON exports as `application/json` with
  `Content-Disposition: attachment`, so `customFetch` parsed the file, unwrapped a top-level `data`
  key if the export had one, and `pull` then failed on `blob.arrayBuffer()`. `customFetch` now
  returns a Blob for any 2xx attachment response; error responses still use the JSON envelope path.
  **Version deliberately not bumped** (stays **2.0.0**).

- **Added (gap 073):** `transl8 pull` no longer fails on a locale with more than 1000 rows. On the
  sync export's `413 EXPORT_TOO_LARGE` it requests an async export job
  (`POST /projects/{id}/exports`), polls `GET /exports/{id}` (2 s, up to 150 polls, progress on
  stderr) and downloads the file; a failed job or a timeout exits 1 with the reason. **Version
  deliberately not bumped** (stays **2.0.0**).

- **Fixed (issue 193):** `dist/cli.js` (`bin.transl8`) now actually runs the CLI — it is bundled
  from the new `src/cli/bin.ts`, which calls `run()`; before, it only exported `run` and every
  command printed nothing and exited 0. The `bin/transl8.mjs` shim is removed. `cli-e2e` now packs
  the package, installs the tarball and runs `pkg.bin.transl8`. **Version deliberately not
  bumped** (stays **2.0.0**).

- **Regenerated (2026-09-25, v0.75.7):** 31 operations now document the standard error
  responses they can already produce (400 on 27, 401 and 403 on 31, 404 on 19), each pointing at
  the existing `ApiErrorEnvelopeDto`. `openapi.json` changes by those responses alone; the
  generated `src/generated/api-client.ts` is **unchanged**. **Version deliberately not bumped**
  (stays **2.0.0**).

- **Regenerated (2026-09-24, v0.75.3):** one added constraint — `maximum: 1000000` on the
  `page` query parameter of the 24 paginated list operations (a `@maximum 1000000` JSDoc
  tag in `src/generated/api-client.ts`). Types are unchanged; a larger `page` was already
  unservable (it answered 500). `openapi.json` and `src/generated/api-client.ts` change by
  that constraint alone. **Version deliberately not bumped** (stays **2.0.0**; see the
  publish-workflow note below).

- **Regenerated (2026-09-22, batch B, ADR 0076):** additive fields only — `mode`
  (`live` | `test`) on the API-key create/rotate responses, the key list item and the
  create-key request (`POST /projects/{projectId}/api-keys`), and `isSandbox` on the
  create-project request and the project response. `openapi.json` and
  `src/generated/api-client.ts` change by those fields alone. **Version deliberately not
  bumped** (stays **2.0.0**; see the publish-workflow note in the entry below).

- **Regenerated (2026-09-21, batch A, issue 179):** one additive optional query
  parameter, `namesOnly`, on `GET /projects/{projectId}/keys` (when `true`/`1`
  each item is `{ id, key }` only). `openapi.json` and `src/generated/api-client.ts`
  change by that parameter alone. **Version deliberately not bumped** and stays
  **2.0.0**: `.github/workflows/publish-api-client.yml` publishes to npm on any
  `package.json` version change that reaches `develop`, and the package has never
  been published — a bump remains Pavlo's call together with P17-02.

- **Publish identity (P17-02 / D1):** the package name on npmjs is
  `@transl8.ai/api-client` (`publishConfig.registry` =
  `https://registry.npmjs.org`, `access: public`). Version stays **2.0.0**
  until the first publish lands. **`bin.transl8` → `./dist/cli.js`** with a
  shebang from `scripts/build.mjs` — npm auto-stripped `bin/transl8.mjs` on
  a dry publish attempt. Dashboard still vendors as `@transl8/api-client`
  via `file:./vendor/api-client`; `make api-client-vendor` rewrites the
  copied name.

- **Regenerated (2026-09-20, batch 6):** the client was re-generated from the
  current OpenAPI document after batches 1-5 (26 operations and 37 schemas
  added, additive changes to 11 operations; 61 generated exports added).
  Removed: `CopilotMessageDtoMetadata` and `TranslationsControllerExplainV1200`,
  both untyped `{ [key: string]: unknown }` placeholders replaced by
  `CopilotMessageMetadataDto` and `TranslationExplainResponseDto`. **Version
  deliberately not bumped** and stays **2.0.0**: the package has never been
  published (see above), so this folds into the first publish, and
  `.github/workflows/publish-api-client.yml` publishes to npm on any
  `package.json` version change that reaches `develop` — a bump is Pavlo's
  call together with P17-02, not a side effect of a regeneration. Under this
  file's own policy the two removed aliases would be a major bump *if* 2.0.0
  had shipped.

- **Regenerated again (2026-09-20, batch 6 item 1):** twelve operations changed
  their documented success status to `202` (see `docs/api/changelog.md`); only
  `openapi.json` moved, no generated export was added, removed or renamed.
  Version still **2.0.0** for the reason above.

- **Regenerated again (2026-09-20, batch 6 item 3):** `ApplyReplayItemsResponseDto`
  gained an additive `conflicts` field and a new `ReplayApplyConflictDto` schema.
  Version still **2.0.0** for the reason above.

## Bump policy

Semver, tied to the API version this client is generated from.

- **Major** — a breaking API change (removed/renamed field or route the
  generated client covers, changed required fields).
- **Minor** — new routes/fields covered, non-breaking.
- **Patch** — runtime-only fix (`src/runtime/*`) with no change to
  generated surface.

## 2.0.0 — 2026-09-16

First regeneration since 1.1.0 (P9-03, 2026-09-11) — the client had
drifted ~5 days behind `develop`, covering every route/DTO change from
P10 (billing/plans), P11 (roles and permissions), P12 (mobile v2
backend additions — `TranslationJobStatusDto.failures/failedItems/
manualReviewItems`, `CoverageCellDto.review`, review-queue `language`/
`cursor`), P13 (analytics, Copilot conversations, MFA, AI config,
audit-log export, and more) that had shipped without a regen in
between.

**Major** (renamed generated type, per this file's own bump policy —
"renamed... route the generated client covers"): `PlatformPlanDetailDto`
→ `PlatformPlanDto` for `GET /platform/plans/{planId}`. Field set is
unchanged (verified: identical property list); this is a rename, not a
shape change, but any TS consumer importing the old type name by name
breaks.

**Minor, additive**: 19 new routes, 31 new schemas — no other removals
or renames (verified: diffed old vs. new `openapi.json` `paths`/
`components.schemas` keys, and diffed every `-export const` against
every `+export const` in the generated client; every removed export was
re-added, none dropped).

## 1.4.0 — 2026-09-14

P13-01 — package now publishable (`"private": false`, `publishConfig` for
GitHub Packages per M2-07) and ships a `transl8` CLI (`bin/transl8.mjs`):
`pull`/`push`/`status`/`publish`, own `--help`, own `make cli-e2e` smoke.
**Minor, additive** — no change to the generated client surface itself, new
package-level capability only. See
`docs/backlog/P13-01-publish-api-client-and-cli.md` for the GitHub Packages
scope conflict this found (blocks an actual publish until a human decides
the package name/registry) and the `importControllerCreateFromFileV1`
multipart generation gap `push` works around.

## 1.3.0 — 2026-09-08

Regenerated from `develop`'s live OpenAPI doc after M1-10 (API key
rotation). **Minor, additive** — one new route,
`POST /api/v1/projects/{projectId}/api-keys/{apiKeyId}/rotate`
(`projectResourcesControllerRotateApiKeyV1`, `RotateApiKeyResponseDto`), and
one new field on the existing `ApiKeyItemDto`
(`replacedByKeyId`, nullable — set while a key is inside its post-rotation
grace window).

## 1.2.0 — 2026-09-08

Regenerated from `develop`'s live OpenAPI doc after issue 145's fix
(`@ApiParam` on six `approval.controller.ts` routes that declared
`:projectId` in the path without binding it, which made generation exit 1
outright — not stale, un-regenerable). **Minor, additive** — the six
canonical `projects/{projectId}/translations/{translationId}/...` approval
routes (`approve`/`reject`/`publish`/`PATCH`/`DELETE`/`retranslate`) are now
covered for the first time, alongside every other route change accumulated
since 1.1.0 while generation was broken (~15k lines of `openapi.json`,
~1.3k lines of `src/generated/api-client.ts` — the size reflects the
backlog, not this fix's own scope).

## 1.1.0 — 2026-09-06

Regenerated from `develop`'s live OpenAPI doc. **Minor, purely additive** — 190
lines added, none removed.

Covers `POST /api/v1/projects/{projectId}/import/xliff`
(`xliffImportControllerImportXliffV1`, `XliffImportResponseDto`), the XLIFF 2.0
import route that shipped in product v0.50.10 ([ADR 0063](../../docs/adr/0063-xliff-interchange.md)).

**Why this is a catch-up rather than a new feature.** The route shipped without
regenerating this client, so `openapi.json` and `src/generated/` had been out of
step with the running API since 2026-09-04. `make api-client-check` — and
`ci.yml`'s "Regenerate api-client and check for drift" step, which runs the same
comparison — therefore fail on `develop` itself, and on every branch cut from
it. This is the drift that gate exists to catch; it went unnoticed because the
gate sits behind earlier steps in the backend job (see
[issue 092](../../docs/issues/092-the-contract-and-drift-gates-are-skipped-whenever-e2e-is-red.md)).

No product `VERSION` bump accompanies this: `packages/api-client` is outside the
root semver cadence by `AGENTS.md` → Versioning, the API behaviour itself
already shipped under v0.50.10, and bumping the root here would collide with
the 0.51.1–0.51.3 range already claimed by the open PR #693.

## 1.0.0 — 2026-09-03

Regenerated from `develop`'s live OpenAPI doc after gap 014 slice 1 / P6-08
(typed, bounded numeric query params), on top of the 0.3.0 route addition
below. **Breaking:** the generated request types for every paginated list
endpoint's `page`/`limit` query param — and
`GET /projects/{projectId}/translations`'s `maxConfidence`/
`draftOlderThanMonths` — narrow from `string` to `number`. A consumer
passing a string literal for any of these now fails to typecheck; pass a
number instead. See `docs/api/changelog.md` (root repo) for the full list
of affected routes and the runtime behavior change (bad input now `400`s
instead of silently defaulting/dropping the filter).

## 0.3.0 — 2026-09-03

New route covered (minor, additive): `POST
/projects/{projectId}/webhooks/deliveries/{deliveryId}/redeliver` (gap
017 — webhook payload retention + redelivery), returning
`RedeliverWebhookDeliveryResponseDto`.

## 0.2.0 — 2026-09-02

Regenerated from current `develop`'s live OpenAPI doc — the client had
drifted behind the contract snapshot (7 routes missing, `make ci` doesn't
run the DB-dependent `api-client-check` gate while the CI runner is down;
see `docs/issues/052-*.md`). New routes covered: GitHub/GitLab webhook
receivers, review-reports CRUD + screenshot, SDK review screenshot.

## 0.1.0 — 2026-08-31

Initial release — `locales` feature migrated as the pilot consumer.
