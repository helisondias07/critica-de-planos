import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadFixture } from "../src/fixtures.ts";
import { EXIT_CODES, exitCodeFor, runCritique } from "../src/pipeline.ts";
import {
  createFakeProvider,
  createHeuristicProvider,
  createPendingLlmProvider,
} from "../src/providers.ts";
import { sanitizeProviderOutput, validatePlanInput } from "../src/validate.ts";

describe("validação de entrada", () => {
  it("rejeita malformado de forma distinguível", async () => {
    const result = await runCritique(loadFixture("malformed.json"), {
      provider: createHeuristicProvider(),
    });
    assert.equal(result.status, "input_error");
    assert.equal(result.findings.length, 0);
    assert.equal(result.error?.code, "INPUT_ERROR");
    assert.equal(exitCodeFor(result.status), EXIT_CODES.input_error);
  });

  it("rejeita id de passo inválido", () => {
    assert.throws(() =>
      validatePlanInput({
        objective: "objetivo suficientemente longo",
        constraints: ["offline agora"],
        steps: [{ id: "passo-1", title: "Um título", description: "descrição longa o bastante" }],
        evidence: [{ id: "e1", source: "src.txt", excerpt: "trecho de evidência sintético" }],
      }),
    );
  });
});

describe("limites e falhas de provedor (falha segura)", () => {
  it("timeout/abort devolve unavailable e achados vazios", async () => {
    const result = await runCritique(loadFixture("timeout-lab.json"), {
      provider: createFakeProvider("timeout"),
      attemptTimeoutMs: 40,
      totalTimeoutMs: 120,
      maxRetries: 0,
    });
    assert.equal(result.status, "unavailable");
    assert.equal(result.findings.length, 0);
    assert.equal(result.meta.timedOut, true);
    assert.equal(exitCodeFor("unavailable"), 3);
  });

  it("provedor que lança não interrompe o chamador", async () => {
    const result = await runCritique(loadFixture("timeout-lab.json"), {
      provider: createFakeProvider("error"),
      maxRetries: 0,
    });
    assert.equal(result.status, "unavailable");
    assert.equal(result.findings.length, 0);
    assert.equal(result.error?.code, "PROVIDER_UNAVAILABLE");
  });

  it("saída inválida vira status invalid", async () => {
    const result = await runCritique(loadFixture("timeout-lab.json"), {
      provider: createFakeProvider("invalid"),
    });
    assert.equal(result.status, "invalid");
    assert.equal(result.findings.length, 0);
    assert.ok(result.meta.ignoredUnexpectedFields.includes("notFindings"));
    assert.equal(exitCodeFor("invalid"), 4);
  });

  it("evidência inventada e stepId inválido são descartados", async () => {
    const result = await runCritique(loadFixture("timeout-lab.json"), {
      provider: createFakeProvider("invented"),
    });
    assert.equal(result.status, "ok");
    assert.equal(result.findings.length, 0);
    assert.ok(result.meta.droppedFindings >= 1);
    assert.ok(result.meta.ignoredUnexpectedFields.includes("approve"));
  });

  it("maxCalls=0 não chama o crítico", async () => {
    const result = await runCritique(loadFixture("timeout-lab.json"), {
      provider: createFakeProvider("error"),
      maxCalls: 0,
    });
    assert.equal(result.status, "unavailable");
    assert.equal(result.meta.callsUsed, 0);
    assert.equal(result.error?.code, "CALL_LIMIT");
  });

  it("llm-pending permanece unavailable sem rede", async () => {
    const result = await runCritique(loadFixture("timeout-lab.json"), {
      provider: createPendingLlmProvider(),
      maxRetries: 0,
    });
    assert.equal(result.status, "unavailable");
    assert.match(result.error?.message ?? "", /modelo real pendente/i);
  });

  it("retry conta chamadas e respeita o teto", async () => {
    const result = await runCritique(loadFixture("timeout-lab.json"), {
      provider: createFakeProvider("error"),
      maxCalls: 2,
      maxRetries: 3,
    });
    assert.equal(result.status, "unavailable");
    assert.equal(result.meta.callsUsed, 2);
    assert.equal(result.meta.retriesUsed, 1);
  });
});

describe("sanitizador", () => {
  it("ignora campos inesperados e citações que não estão na origem declarada", () => {
    const input = validatePlanInput(loadFixture("timeout-lab.json"));
    const report = sanitizeProviderOutput(
      {
        execute: "please run this",
        findings: [
          {
            id: "F01",
            severity: "low",
            category: "gap",
            stepId: "s1",
            sourceKind: "evidence",
            sourceId: "e1",
            proofKind: "observed-excerpt",
            title: "ok",
            hypothesis: "hipótese válida o suficiente",
            citedEvidence: "trecho que nunca apareceu",
            verificationAction: "verificar manualmente o texto",
            extra: 1,
          },
        ],
      },
      input,
    );
    assert.equal(report.findings.length, 0);
    assert.ok(report.ignoredUnexpectedFields.includes("execute"));
    assert.ok(report.droppedFindings >= 1);
  });

  it("aceita citação ancorada no passo, mesmo que o array evidence não a contenha", () => {
    const input = validatePlanInput(loadFixture("timeout-lab.json"));
    const report = sanitizeProviderOutput(
      {
        findings: [
          {
            id: "F01",
            severity: "low",
            category: "gap",
            stepId: "s1",
            sourceKind: "step",
            sourceId: "s1",
            proofKind: "observed-excerpt",
            title: "origem no passo",
            hypothesis: "o trecho observado está no passo, não no catálogo",
            citedEvidence: "Não deve ser executado",
            verificationAction: "ler o passo s1 de novo",
          },
        ],
      },
      input,
    );
    assert.equal(report.findings.length, 1);
    assert.equal(report.findings[0]?.sourceKind, "step");
  });
});
