import { defineConfig } from 'orval';

// Deliberately no `output.baseUrl` — customFetch (src/runtime/fetcher.ts)
// resolves the base URL at runtime via configureApiClient(), per consumer.
export default defineConfig({
  apiClient: {
    input: {
      target: './openapi.json',
    },
    output: {
      mode: 'single',
      target: './src/generated/api-client.ts',
      client: 'fetch',
      override: {
        mutator: {
          path: './src/runtime/fetcher.ts',
          name: 'customFetch',
        },
        // customFetch already unwraps the `{ data, status, headers }`
        // envelope and returns the body directly — without this, orval's
        // default fetch-client typing wraps every response type in that
        // envelope, which is wrong for what callers actually get back.
        fetch: {
          includeHttpResponseReturnType: false,
        },
      },
    },
  },
});
