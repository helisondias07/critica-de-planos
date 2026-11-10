import {
  CATEGORIES,
  CRITIC_KINDS,
  SEVERITIES,
  STATUSES,
  type CritiqueResult,
  type Finding,
  type PlanEvidence,
  type PlanInput,
  type PlanStep,
} from "./contract.js";
import { DEFAULTS } from "./defaults.js";

export class InputValidationError extends Error {
  readonly code = "INPUT_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "InputValidationError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown, field: string, min: number, max: number): string {
  if (typeof value !== "string") {
    throw new InputValidationError(`${field} deve ser string`);
  }
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw new InputValidationError(
      `${field} deve ter entre ${min} e ${max} caracteres`,
    );
  }
  return trimmed;
}

function uniqueIds(ids: string[], label: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new InputValidationError(`${label} duplicado: ${id}`);
    }
    seen.add(id);
  }
}

export function validatePlanInput(raw: unknown, maxBytes = DEFAULTS.maxInputBytes): PlanInput {
  if (raw === undefined || raw === null) {
    throw new InputValidationError("entrada vazia");
  }
  const serialized = JSON.stringify(raw);
  if (serialized.length > maxBytes) {
    throw new InputValidationError(
      `entrada excede maxInputBytes (${maxBytes})`,
    );
  }
  if (!isRecord(raw)) {
    throw new InputValidationError("entrada deve ser um objeto JSON");
  }

  const objective = asString(raw.objective, "objective", 8, DEFAULTS.maxStringChars);
  const context =
    raw.context === undefined
      ? undefined
      : asString(raw.context, "context", 0, DEFAULTS.maxStringChars);

  if (!Array.isArray(raw.steps) || raw.steps.length < 1) {
    throw new InputValidationError("steps deve ser array com ao menos 1 item");
  }
  if (raw.steps.length > DEFAULTS.maxSteps) {
    throw new InputValidationError(`steps excede ${DEFAULTS.maxSteps}`);
  }

  if (!Array.isArray(raw.constraints)) {
    throw new InputValidationError("constraints deve ser array");
  }
  if (raw.constraints.length > DEFAULTS.maxConstraints) {
    throw new InputValidationError(`constraints excede ${DEFAULTS.maxConstraints}`);
  }

  if (!Array.isArray(raw.evidence) || raw.evidence.length < 1) {
    throw new InputValidationError("evidence deve ser array com ao menos 1 item");
  }
  if (raw.evidence.length > DEFAULTS.maxEvidence) {
    throw new InputValidationError(`evidence excede ${DEFAULTS.maxEvidence}`);
  }

  const steps: PlanStep[] = raw.steps.map((item, index) => {
    if (!isRecord(item)) {
      throw new InputValidationError(`steps[${index}] inválido`);
    }
    const id = asString(item.id, `steps[${index}].id`, 2, 8);
    if (!/^s[0-9]{1,3}$/.test(id)) {
      throw new InputValidationError(`steps[${index}].id inválido (use s1, s2, …)`);
    }
    return {
      id,
      title: asString(item.title, `steps[${index}].title`, 3, 200),
      description: asString(
        item.description,
        `steps[${index}].description`,
        8,
        DEFAULTS.maxStringChars,
      ),
    };
  });
  uniqueIds(steps.map((s) => s.id), "step id");

  const constraints = raw.constraints.map((item, index) =>
    asString(item, `constraints[${index}]`, 3, DEFAULTS.maxStringChars),
  );

  const evidence: PlanEvidence[] = raw.evidence.map((item, index) => {
    if (!isRecord(item)) {
      throw new InputValidationError(`evidence[${index}] inválido`);
    }
    const id = asString(item.id, `evidence[${index}].id`, 2, 8);
    if (!/^e[0-9]{1,3}$/.test(id)) {
      throw new InputValidationError(`evidence[${index}].id inválido (use e1, e2, …)`);
    }
    return {
      id,
      source: asString(item.source, `evidence[${index}].source`, 3, 200),
      excerpt: asString(
        item.excerpt,
        `evidence[${index}].excerpt`,
        8,
        DEFAULTS.maxStringChars,
      ),
    };
  });
  uniqueIds(evidence.map((e) => e.id), "evidence id");

  return { objective, steps, constraints, evidence, context };
}

function includesCitation(excerpt: string, cited: string): boolean {
  const normalize = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  const a = normalize(excerpt);
  const b = normalize(cited);
  return b.length >= 8 && a.includes(b);
}

export interface SanitizeReport {
  findings: Finding[];
  droppedFindings: number;
  ignoredUnexpectedFields: string[];
  structureInvalid: boolean;
}

export function sanitizeProviderOutput(
  raw: unknown,
  input: PlanInput,
): SanitizeReport {
  const ignored: string[] = [];
  if (!isRecord(raw)) {
    return {
      findings: [],
      droppedFindings: 0,
      ignoredUnexpectedFields: [],
      structureInvalid: true,
    };
  }

  for (const key of Object.keys(raw)) {
    if (key !== "findings") ignored.push(key);
  }

  if (!Array.isArray(raw.findings)) {
    return {
      findings: [],
      droppedFindings: 0,
      ignoredUnexpectedFields: ignored,
      structureInvalid: true,
    };
  }

  const stepIds = new Set(input.steps.map((s) => s.id));
  const evidenceById = new Map(input.evidence.map((e) => [e.id, e]));
  const usedFindingIds = new Set<string>();
  const findings: Finding[] = [];
  let dropped = 0;

  for (const item of raw.findings.slice(0, DEFAULTS.maxFindings * 2)) {
    if (!isRecord(item)) {
      dropped += 1;
      continue;
    }
    for (const key of Object.keys(item)) {
      const allowed = [
        "id",
        "severity",
        "category",
        "stepId",
        "evidenceId",
        "title",
        "hypothesis",
        "citedEvidence",
        "verificationAction",
      ];
      if (!allowed.includes(key)) ignored.push(`finding.${key}`);
    }

    const id = typeof item.id === "string" ? item.id.trim() : "";
    const severity = item.severity;
    const category = item.category;
    const stepId = typeof item.stepId === "string" ? item.stepId.trim() : "";
    const evidenceId =
      typeof item.evidenceId === "string" ? item.evidenceId.trim() : "";
    const title = typeof item.title === "string" ? item.title.trim() : "";
    const hypothesis =
      typeof item.hypothesis === "string" ? item.hypothesis.trim() : "";
    const citedEvidence =
      typeof item.citedEvidence === "string" ? item.citedEvidence.trim() : "";
    const verificationAction =
      typeof item.verificationAction === "string"
        ? item.verificationAction.trim()
        : "";

    const evidence = evidenceById.get(evidenceId);
    const ok =
      /^F[0-9]{2,4}$/.test(id) &&
      !usedFindingIds.has(id) &&
      SEVERITIES.includes(severity as Finding["severity"]) &&
      CATEGORIES.includes(category as Finding["category"]) &&
      stepIds.has(stepId) &&
      evidence !== undefined &&
      title.length >= 3 &&
      title.length <= 200 &&
      hypothesis.length >= 8 &&
      hypothesis.length <= DEFAULTS.maxStringChars &&
      citedEvidence.length >= 8 &&
      citedEvidence.length <= DEFAULTS.maxStringChars &&
      verificationAction.length >= 8 &&
      verificationAction.length <= DEFAULTS.maxStringChars &&
      evidence !== undefined &&
      includesCitation(evidence.excerpt, citedEvidence);

    if (!ok || findings.length >= DEFAULTS.maxFindings) {
      dropped += 1;
      continue;
    }
    usedFindingIds.add(id);
    findings.push({
      id,
      severity: severity as Finding["severity"],
      category: category as Finding["category"],
      stepId,
      evidenceId,
      title,
      hypothesis,
      citedEvidence,
      verificationAction,
    });
  }

  return {
    findings,
    droppedFindings: dropped,
    ignoredUnexpectedFields: [...new Set(ignored)].slice(0, 40),
    structureInvalid: false,
  };
}

export function assertResultShape(result: CritiqueResult): void {
  if (!STATUSES.includes(result.status)) {
    throw new Error("status fora do contrato");
  }
  if (!CRITIC_KINDS.includes(result.criticKind)) {
    throw new Error("criticKind fora do contrato");
  }
}
