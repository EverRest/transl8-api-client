import { describe, expect, it } from 'vitest';
import { configureApiClient, getApiClientConfig } from './config';

describe('configureApiClient / getApiClientConfig', () => {
  it('throws before configureApiClient has been called', () => {
    expect(() => getApiClientConfig()).toThrow(
      '@transl8.ai/api-client: configureApiClient() must be called before making a request.',
    );
  });

  it('returns the config after configureApiClient is called', () => {
    const getAuthToken = () => 'token-123';
    configureApiClient({ baseUrl: 'https://api.example.com', getAuthToken });

    expect(getApiClientConfig()).toEqual({
      baseUrl: 'https://api.example.com',
      getAuthToken,
    });
  });
});
