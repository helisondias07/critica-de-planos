const SECRETISH = /(api[_-]?key|authorization|bearer|token|secret|password)/i;

export function redactHeaderValue(name: string, value: string): string {
  if (SECRETISH.test(name) || SECRETISH.test(value) || value.startsWith("Bearer ")) {
    return "[redacted]";
  }
  return value.length > 80 ? `${value.slice(0, 24)}…` : value;
}

export function endpointHost(urlString: string): string {
  try {
    const u = new URL(urlString);
    return `${u.protocol}//${u.host}`;
  } catch {
    return "invalid-url";
  }
}

export function logLine(message: string, fields: Record<string, string | number | boolean | undefined> = {}): void {
  const parts = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `${k}=${String(v)}`);
  process.stderr.write(`[critica] ${message}${parts.length ? " " + parts.join(" ") : ""}\n`);
}
