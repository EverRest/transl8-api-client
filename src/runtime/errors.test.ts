import { describe, expect, it } from 'vitest';
import { ApiError, parseApiErrorBody } from './errors';

describe('parseApiErrorBody', () => {
  it('builds an ApiError from the standard error envelope', () => {
    const error = parseApiErrorBody(404, {
      success: false,
      error: {
        code: 'PROJECT_NOT_FOUND',
        message: 'Project not found',
        details: [],
        traceId: 'trace-abc',
      },
    });

    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(404);
    expect(error.code).toBe('PROJECT_NOT_FOUND');
    expect(error.traceId).toBe('trace-abc');
    expect(error.message).toBe('Project not found');
    expect(error.details).toEqual([]);
  });

  it('includes field-level details for validation errors', () => {
    const error = parseApiErrorBody(400, {
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Validation failed',
        details: [
          { field: 'email', constraint: 'isEmail', message: 'email must be an email' },
        ],
        traceId: 'trace-xyz',
      },
    });

    expect(error.details).toEqual([
      { field: 'email', constraint: 'isEmail', message: 'email must be an email' },
    ]);
  });

  it('falls back gracefully on a malformed body', () => {
    const error = parseApiErrorBody(500, undefined);

    expect(error.status).toBe(500);
    expect(error.code).toBe('HTTP_ERROR');
    expect(error.message).toBe('API error: 500');
    expect(error.details).toEqual([]);
  });
});
