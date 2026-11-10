import type { PlanInput, ProofKind, SourceKind } from "./contract.js";

export function constraintId(index: number): string {
  return `c${index + 1}`;
}

export function resolveSourceText(input: PlanInput, kind: SourceKind, id: string): string | undefined {
  switch (kind) {
    case "objective":
      return id === "objective" ? input.objective : undefined;
    case "context":
      return id === "context" ? (input.context ?? undefined) : undefined;
    case "step": {
      const step = input.steps.find((s) => s.id === id);
      return step ? `${step.title}. ${step.description}` : undefined;
    }
    case "constraint": {
      const match = /^c([0-9]{1,3})$/.exec(id);
      if (!match) return undefined;
      const index = Number(match[1]) - 1;
      return input.constraints[index];
    }
    case "evidence": {
      const ev = input.evidence.find((e) => e.id === id);
      return ev ? ev.excerpt : undefined;
    }
    default:
      return undefined;
  }
}

export function normalizeQuote(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function quoteContains(source: string, quoted: string): boolean {
  const a = normalizeQuote(source).toLowerCase();
  const b = normalizeQuote(quoted).toLowerCase();
  if (b.endsWith("...")) {
    const stem = b.slice(0, -3).trim();
    return stem.length >= 8 && a.includes(stem);
  }
  return b.length >= 8 && a.includes(b);
}

/** Recorte curto em torno do primeiro match; sem match, undefined (não cai no primeiro item). */
export function quoteAround(source: string, pattern: RegExp, max = 180): string | undefined {
  const text = normalizeQuote(source);
  const match = pattern.exec(text);
  if (!match || match.index === undefined) return undefined;
  const pad = 24;
  const start = Math.max(0, match.index - pad);
  const end = Math.min(text.length, match.index + match[0].length + pad);
  let slice = text.slice(start, end).trim();
  if (start > 0) slice = slice.replace(/^\S*\s/, "");
  if (end < text.length) slice = slice.replace(/\s\S*$/, "");
  if (slice.length < 8) slice = text.slice(0, Math.min(max, text.length));
  return slice.length <= max ? slice : slice.slice(0, max - 3) + "...";
}

export function labelProof(kind: ProofKind): string {
  return kind === "observed-excerpt"
    ? "trecho observado na origem declarada"
    : "hipótese de ausência; o trecho citado é o contexto observado, não prova do que falta";
}
