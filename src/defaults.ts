/** Defaults documentados. Ajustáveis via CLI ou Options. */

export const DEFAULTS = {
  maxCalls: 3,
  maxRetries: 1,
  totalTimeoutMs: 8000,
  attemptTimeoutMs: 2500,
  maxInputBytes: 65_536,
  maxFindings: 20,
  maxStringChars: 2_000,
  maxSteps: 40,
  maxEvidence: 40,
  maxConstraints: 30,
} as const;

export const DISCLAIMER =
  "Este resultado vem de um crítico heurístico determinístico, replay local ou provedor fake. NÃO é um segundo LLM. NÃO valida qualidade de IA. Achados NÃO são instruções confiáveis, NÃO aprovam o plano e NÃO devem ser executados automaticamente.";

export const CRITIC_KIND_LABEL = {
  "heuristic-deterministic": "heurístico determinístico (não é LLM)",
  replay: "replay de fixture (não é LLM)",
  fake: "provedor fake de teste (não é LLM)",
  unavailable: "indisponível",
} as const;
