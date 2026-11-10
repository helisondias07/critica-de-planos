export const SEVERITIES = ["critical", "high", "medium", "low"] as const;
export type Severity = (typeof SEVERITIES)[number];

export const CATEGORIES = ["risk", "assumption", "gap"] as const;
export type Category = (typeof CATEGORIES)[number];

export const STATUSES = ["ok", "unavailable", "invalid", "input_error"] as const;
export type CritiqueStatus = (typeof STATUSES)[number];

export const CRITIC_KINDS = [
  "heuristic-deterministic",
  "replay",
  "fake",
  "unavailable",
  "http-chat",
] as const;
export type CriticKind = (typeof CRITIC_KINDS)[number];

export const SOURCE_KINDS = [
  "step",
  "constraint",
  "evidence",
  "context",
  "objective",
] as const;
export type SourceKind = (typeof SOURCE_KINDS)[number];

export const PROOF_KINDS = ["observed-excerpt", "inferred-absence"] as const;
export type ProofKind = (typeof PROOF_KINDS)[number];

export interface PlanStep {
  id: string;
  title: string;
  description: string;
}

export interface PlanEvidence {
  id: string;
  source: string;
  excerpt: string;
}

export interface PlanInput {
  objective: string;
  steps: PlanStep[];
  constraints: string[];
  evidence: PlanEvidence[];
  context?: string;
}

export interface Finding {
  id: string;
  severity: Severity;
  category: Category;
  /** Passo ao qual o risco/lacuna se refere. */
  stepId: string;
  /** Origem do trecho citado — não precisa ser o array evidence. */
  sourceKind: SourceKind;
  /** sN, cN, eN, "objective" ou "context". */
  sourceId: string;
  /**
   * observed-excerpt: o trecho sustenta a afirmação.
   * inferred-absence: o trecho é contexto observado; a falta em si não está escrita.
   * Validação estrutural NÃO prova relevância semântica de modelo.
   */
  proofKind: ProofKind;
  title: string;
  hypothesis: string;
  citedEvidence: string;
  verificationAction: string;
}

export interface CritiqueMeta {
  providerId: string;
  criticKind: CriticKind;
  callsUsed: number;
  maxCalls: number;
  retriesUsed: number;
  timedOut: boolean;
  aborted: boolean;
  droppedFindings: number;
  ignoredUnexpectedFields: string[];
  model?: string;
  endpointHost?: string;
  transport?: string;
  blockReason?: string;
}

export interface CritiqueResult {
  status: CritiqueStatus;
  criticKind: CriticKind;
  disclaimer: string;
  findings: Finding[];
  error?: {
    code: string;
    message: string;
  };
  meta: CritiqueMeta;
}

export interface RawProviderFinding {
  [key: string]: unknown;
}

export interface RawProviderOutput {
  findings?: unknown;
  [key: string]: unknown;
}

export interface ProviderRequest {
  input: PlanInput;
  signal: AbortSignal;
}

export interface CritiqueProvider {
  readonly id: string;
  readonly kind: CriticKind;
  readonly model?: string;
  readonly endpointHost?: string;
  readonly transport?: string;
  critique(request: ProviderRequest): Promise<RawProviderOutput>;
}

export interface RunOptions {
  provider: CritiqueProvider;
  maxCalls?: number;
  maxRetries?: number;
  totalTimeoutMs?: number;
  attemptTimeoutMs?: number;
  signal?: AbortSignal;
  abortAfterMs?: number;
}
