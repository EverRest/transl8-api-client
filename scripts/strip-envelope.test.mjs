import { describe, expect, it } from 'vitest';
import { stripEnvelope } from './strip-envelope.mjs';

describe('stripEnvelope', () => {
  it('replaces an enveloped response schema with its data schema', () => {
    const document = {
      paths: {
        '/config/locales': {
          get: {
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: {
                      properties: {
                        success: { type: 'boolean', example: true },
                        data: { $ref: '#/components/schemas/LocaleCatalogDto' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const result = stripEnvelope(document);

    expect(
      result.paths['/config/locales'].get.responses['200'].content['application/json'].schema,
    ).toEqual({ $ref: '#/components/schemas/LocaleCatalogDto' });
  });

  it('leaves a non-enveloped response schema untouched', () => {
    const document = {
      paths: {
        '/legacy/route': {
          get: {
            responses: {
              '200': {
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/LegacyDto' },
                  },
                },
              },
            },
          },
        },
      },
    };

    const result = stripEnvelope(document);

    expect(
      result.paths['/legacy/route'].get.responses['200'].content['application/json'].schema,
    ).toEqual({ $ref: '#/components/schemas/LegacyDto' });
  });

  it('leaves an error response (no data property) untouched', () => {
    const document = {
      paths: {
        '/config/locales': {
          get: {
            responses: {
              '400': {
                content: {
                  'application/json': {
                    schema: {
                      properties: {
                        success: { type: 'boolean', example: false },
                        error: { $ref: '#/components/schemas/ApiErrorBodyDto' },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    };

    const result = stripEnvelope(document);

    expect(
      result.paths['/config/locales'].get.responses['400'].content['application/json'].schema,
    ).toEqual({
      properties: {
        success: { type: 'boolean', example: false },
        error: { $ref: '#/components/schemas/ApiErrorBodyDto' },
      },
    });
  });
});
