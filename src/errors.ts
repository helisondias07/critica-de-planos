export class ProviderError extends Error {
  readonly code: string;
  readonly httpStatus?: number;
  readonly retryAfterMs?: number;
  readonly retryable: boolean;

  constructor(
    code: string,
    message: string,
    extra: { httpStatus?: number; retryAfterMs?: number; retryable?: boolean } = {},
  ) {
    super(message);
    this.code = code;
    this.httpStatus = extra.httpStatus;
    this.retryAfterMs = extra.retryAfterMs;
    this.name = "ProviderError";
    if (extra.retryable !== undefined) {
      this.retryable = extra.retryable;
    } else if (code === "INVALID_OUTPUT" || code === "NOT_CONFIGURED") {
      this.retryable = false;
    } else {
      this.retryable = true;
    }
  }
}

export function isAbortError(err: unknown): boolean {
  const name =
    typeof err === "object" && err !== null && "name" in err
      ? String((err as { name: string }).name)
      : "";
  return name === "AbortError" || name === "TimeoutError";
}

export function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
