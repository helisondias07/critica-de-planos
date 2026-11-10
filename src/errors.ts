export class ProviderError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "ProviderError";
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
