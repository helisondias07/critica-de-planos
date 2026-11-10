/**
 * Retry-After (RFC 9110 §10.2.3): delay-seconds ou HTTP-date.
 * Sem cabeçalho válido → undefined (não inventar espera).
 */
export function parseRetryAfterHeader(
  header: string | null | undefined,
  nowMs = Date.now(),
): number | undefined {
  if (header == null) return undefined;
  const trimmed = String(header).trim();
  if (!trimmed) return undefined;
  if (/^\d+$/.test(trimmed)) {
    const seconds = Number(trimmed);
    if (!Number.isFinite(seconds) || seconds < 0) return undefined;
    return seconds * 1000;
  }
  const when = Date.parse(trimmed);
  if (Number.isNaN(when)) return undefined;
  return Math.max(0, when - nowMs);
}
