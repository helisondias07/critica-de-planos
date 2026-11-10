/** JSON Schema (draft 2020-12) do contrato — documentação e validação própria. */

export const planInputSchema = {
  $id: "https://local.critica-de-planos/schemas/plan-input.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "PlanInput",
  type: "object",
  additionalProperties: true,
  required: ["objective", "steps", "constraints", "evidence"],
  properties: {
    objective: { type: "string", minLength: 8, maxLength: 2000 },
    context: { type: "string", maxLength: 2000 },
    constraints: {
      type: "array",
      maxItems: 30,
      items: { type: "string", minLength: 3, maxLength: 2000 },
    },
    steps: {
      type: "array",
      minItems: 1,
      maxItems: 40,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "title", "description"],
        properties: {
          id: { type: "string", pattern: "^s[0-9]{1,3}$" },
          title: { type: "string", minLength: 3, maxLength: 200 },
          description: { type: "string", minLength: 8, maxLength: 2000 },
        },
      },
    },
    evidence: {
      type: "array",
      minItems: 1,
      maxItems: 40,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "source", "excerpt"],
        properties: {
          id: { type: "string", pattern: "^e[0-9]{1,3}$" },
          source: { type: "string", minLength: 3, maxLength: 200 },
          excerpt: { type: "string", minLength: 8, maxLength: 2000 },
        },
      },
    },
  },
} as const;

export const findingSchema = {
  type: "object",
  additionalProperties: false,
  required: [
    "id",
    "severity",
    "category",
    "stepId",
    "sourceKind",
    "sourceId",
    "proofKind",
    "title",
    "hypothesis",
    "citedEvidence",
    "verificationAction",
  ],
  properties: {
    id: { type: "string", pattern: "^F[0-9]{2,4}$" },
    severity: { enum: ["critical", "high", "medium", "low"] },
    category: { enum: ["risk", "assumption", "gap"] },
    stepId: { type: "string", pattern: "^s[0-9]{1,3}$" },
    sourceKind: { enum: ["step", "constraint", "evidence", "context", "objective"] },
    sourceId: { type: "string", minLength: 1, maxLength: 16 },
    proofKind: { enum: ["observed-excerpt", "inferred-absence"] },
    title: { type: "string", minLength: 3, maxLength: 200 },
    hypothesis: { type: "string", minLength: 8, maxLength: 2000 },
    citedEvidence: { type: "string", minLength: 8, maxLength: 2000 },
    verificationAction: { type: "string", minLength: 8, maxLength: 2000 },
  },
} as const;

export const critiqueOutputSchema = {
  $id: "https://local.critica-de-planos/schemas/critique-output.json",
  $schema: "https://json-schema.org/draft/2020-12/schema",
  title: "CritiqueResult",
  type: "object",
  additionalProperties: false,
  required: ["status", "criticKind", "disclaimer", "findings", "meta"],
  properties: {
    status: { enum: ["ok", "unavailable", "invalid", "input_error"] },
    criticKind: {
      enum: ["heuristic-deterministic", "replay", "fake", "unavailable"],
    },
    disclaimer: { type: "string" },
    error: {
      type: "object",
      additionalProperties: false,
      required: ["code", "message"],
      properties: {
        code: { type: "string" },
        message: { type: "string" },
      },
    },
    findings: { type: "array", maxItems: 20, items: findingSchema },
    meta: {
      type: "object",
      additionalProperties: false,
      required: [
        "providerId",
        "criticKind",
        "callsUsed",
        "maxCalls",
        "retriesUsed",
        "timedOut",
        "aborted",
        "droppedFindings",
        "ignoredUnexpectedFields",
      ],
      properties: {
        providerId: { type: "string" },
        criticKind: {
          enum: ["heuristic-deterministic", "replay", "fake", "unavailable"],
        },
        callsUsed: { type: "integer", minimum: 0 },
        maxCalls: { type: "integer", minimum: 0 },
        retriesUsed: { type: "integer", minimum: 0 },
        timedOut: { type: "boolean" },
        aborted: { type: "boolean" },
        droppedFindings: { type: "integer", minimum: 0 },
        ignoredUnexpectedFields: { type: "array", items: { type: "string" } },
      },
    },
  },
} as const;
