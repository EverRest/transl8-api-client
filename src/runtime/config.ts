export type ApiClientConfig = {
  baseUrl: string;
  getAuthToken?: () => string | null | undefined;
  /** Called before each wait when a 429/503 is retried (`attempt` counts from 1 up to `max`). */
  onRetry?: (info: { status: number; waitMs: number; attempt: number; max: number }) => void;
};

let currentConfig: ApiClientConfig | undefined;

export function configureApiClient(config: ApiClientConfig): void {
  currentConfig = config;
}

export function getApiClientConfig(): ApiClientConfig {
  if (!currentConfig) {
    throw new Error(
      '@transl8.ai/api-client: configureApiClient() must be called before making a request.',
    );
  }
  return currentConfig;
}
