import { ProviderError } from "./errors.js";

/** Inteiro positivo; vazio usa default. 0, negativo, NaN e não-inteiro → erro de configuração (não `|| default`). */
export function parsePositiveIntEnv(
  raw: string | undefined,
  name: string,
  fallback: number,
  max: number,
): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0 || n > max) {
    throw new ProviderError(
      "NOT_CONFIGURED",
      `${name} deve ser inteiro em 1..${max}; recebido ${JSON.stringify(raw)}`,
      { retryable: false },
    );
  }
  return n;
}
