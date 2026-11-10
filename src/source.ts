import type { PlanInput, ProofKind, SourceKind } from "./contract.js";

export const MIN_QUOTE_CHARS = 16;
export const MIN_QUOTE_WORDS = 3;

const TRIVIAL_TOKENS = new Set([
  "o",
  "a",
  "os",
  "as",
  "de",
  "da",
  "do",
  "das",
  "dos",
  "e",
  "ou",
  "em",
  "um",
  "uma",
  "uns",
  "umas",
  "para",
  "por",
  "com",
  "no",
  "na",
  "nos",
  "nas",
  "ao",
  "à",
  "the",
  "and",
  "or",
  "of",
  "to",
  "in",
  "on",
  "for",
  "an",
  "is",
  "it",
  "this",
  "that",
  "plano",
  "plan",
  "passo",
  "step",
]);

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
  return value.normalize("NFKC").replace(/\s+/g, " ").trim();
}

export function tokenizeForQuote(value: string): string[] {
  return normalizeQuote(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

function consecutiveTokens(haystack: string[], needle: string[]): boolean {
  if (needle.length === 0 || needle.length > haystack.length) return false;
  for (let i = 0; i <= haystack.length - needle.length; i += 1) {
    let ok = true;
    for (let j = 0; j < needle.length; j += 1) {
      if (haystack[i + j] !== needle[j]) {
        ok = false;
        break;
      }
    }
    if (ok) return true;
  }
  return false;
}

/**
 * Prova estrutural de citação: tokens consecutivos após NFKC + fronteira de palavra.
 * Não afirma relevância semântica. Rejeita trechos curtos/triviais.
 */
export function quoteContains(source: string, quoted: string): boolean {
  const normalizedQuoted = normalizeQuote(quoted);
  const withoutEllipsis = normalizedQuoted.endsWith("...")
    ? normalizedQuoted.slice(0, -3).trim()
    : normalizedQuoted;
  if (withoutEllipsis.length < MIN_QUOTE_CHARS) return false;
  const needle = tokenizeForQuote(withoutEllipsis);
  if (needle.length < MIN_QUOTE_WORDS) return false;
  const content = needle.filter((t) => !TRIVIAL_TOKENS.has(t));
  if (content.length < 1) return false;
  if (content.join("").length < 8) return false;
  const haystack = tokenizeForQuote(source);
  return consecutiveTokens(haystack, needle);
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
  if (slice.length < MIN_QUOTE_CHARS || tokenizeForQuote(slice).length < MIN_QUOTE_WORDS) {
    slice = text.slice(0, Math.min(max, text.length));
  }
  return slice.length <= max ? slice : slice.slice(0, max - 3) + "...";
}

export function labelProof(kind: ProofKind): string {
  return kind === "observed-excerpt"
    ? "trecho observado na origem declarada"
    : "ausência inferida: o trecho é só contexto observado, não prova do que falta";
}
