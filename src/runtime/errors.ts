export type ApiErrorDetail = {
  field: string;
  constraint: string;
  message: string;
};

export class ApiError extends Error {
  status: number;
  code: string;
  traceId: string;
  details: ApiErrorDetail[];

  constructor(
    message: string,
    status: number,
    options: { code: string; traceId: string; details: ApiErrorDetail[] },
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = options.code;
    this.traceId = options.traceId;
    this.details = options.details;
  }
}

type ApiErrorEnvelope = {
  success?: false;
  error?: {
    code?: string;
    message?: string;
    details?: ApiErrorDetail[];
    traceId?: string;
  };
};

export function parseApiErrorBody(status: number, body: unknown): ApiError {
  const envelope = (body ?? {}) as ApiErrorEnvelope;
  const error = envelope.error;
  return new ApiError(error?.message ?? `API error: ${status}`, status, {
    code: error?.code ?? 'HTTP_ERROR',
    traceId: error?.traceId ?? '',
    details: error?.details ?? [],
  });
}
