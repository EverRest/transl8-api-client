# @transl8.ai/api-client

Command-line tool and typed HTTP client for the transl8.ai translation API.

The package contains two things:

- The `transl8` CLI. It pulls, pushes and publishes translations.
- A typed HTTP client. You can use it in your own TypeScript or JavaScript code.

## Install and run

Run the CLI without an install:

```bash
npx -y -p @transl8.ai/api-client transl8 --help
```

The package name and the command name differ. Use `-p <package> <command>`.

**Never run `npx transl8` without `-p`.** The name `transl8` on npm belongs to a different package. Without `-p`, npm runs that package, not this one.

This package needs Node.js 22.18 or later.

## Set the host and the key

```bash
export TRANSL8_API_BASE_URL=https://your-transl8-host
export TRANSL8_API_KEY=ta_live_...
```

- Give the host only. Do not add `/api/v1`.
- The CLI has no default host. You must set one.
- You can pass `--api-base-url=<host>` and `--key=<key>` instead of the variables.
- If the host is missing, the CLI prints this message and exits with code 1:
  `transl8: set --api-base-url or TRANSL8_API_BASE_URL (the API host, for example https://api.example.com)`

## Commands

Export a locale to stdout:

```bash
transl8 pull my-project fr --format=json > fr.json
```

Import the strings of a file, then apply the import session:

```bash
transl8 push fr.json --project=my-project
```

Poll a translation job until it finishes:

```bash
transl8 status job_abc123
```

Publish all approved translations of a locale:

```bash
transl8 publish my-project fr
```

Results of `push`, `status` and `publish` go to stdout as JSON. Progress messages go to stderr.

## API key scopes

- `exports:read` covers `pull` of a locale with up to 1000 rows.
- A larger locale starts an async export job. The key then needs `exports:write` as well.

## Exit codes

- `0`: the command succeeded, or you asked for `--help`.
- `1`: any error. This covers a missing key, a missing host, an unknown command, wrong arguments, and an API or network failure. The CLI prints the reason to stderr.

## Use in CI

A GitHub Action and a GitLab CI template for this CLI exist. This page will link to them when they are published.

## Use as a library

```ts
import { configureApiClient, getTranslationJob } from '@transl8.ai/api-client';

configureApiClient({
  baseUrl: 'https://your-transl8-host',
  getAuthToken: () => process.env.TRANSL8_API_KEY,
});

const job = await getTranslationJob('job_abc123');
console.log(job.status);
```

Call `configureApiClient` once before the first request. Every other function is generated from the API contract and is exported from the package root.

## Rate limits

The client retries a `429` (any method) and a `503` (`GET`/`HEAD`) up to 3 times, waiting for `Retry-After` or 1 s, 2 s, 4 s. A wait above 60 s is not done: the error comes back at once. Pass `onRetry` to `configureApiClient` to see each retry. There is no option to disable it. Open an issue if you need one.

## Regenerate the client

The client in `src/generated` is generated from `openapi.json`. Never edit `src/generated` or `openapi.json` by hand. CI fails if they drift.

To take a new API contract:

```bash
npm run sync-openapi -- --from https://your-transl8-host
npm run generate
```

- `sync-openapi` fetches `/api/v1/docs-json` from the host and writes `openapi.json` and `openapi.source.json`. The record holds the backend version, the API version, the fetch time and the sha256 of `openapi.json`.
- The script has no default host. You can set `TRANSL8_SPEC_URL` instead of `--from`. Give the host only.
- Run it against a host that runs the backend version you want to follow. A host that lags behind gives an old contract.
- `npm run generate` reads only `openapi.json`. It needs no network.

## Contributing

Run `npm ci`, then `npm run typecheck`, `npm test`, `npm run build` and `npm run cli-e2e` before a pull request. Report a security problem as described in [SECURITY.md](SECURITY.md).

## License

MIT
