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
] as const;
export type CriticKind = (typeof CRITIC_KINDS)[number];

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
  stepId: string;
  evidenceId: string;
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
