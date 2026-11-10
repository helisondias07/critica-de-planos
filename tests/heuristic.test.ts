import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { loadFixture } from "../src/fixtures.ts";
import { runHeuristic } from "../src/heuristic.ts";
import { runCritique } from "../src/pipeline.ts";
import { createHeuristicProvider } from "../src/providers.ts";
import { validatePlanInput } from "../src/validate.ts";

function critique(name: string) {
  return runCritique(loadFixture(name), { provider: createHeuristicProvider() });
}

describe("heurística determinística (não é LLM)", () => {
  it("marca riscos no plano ruim de e-commerce", async () => {
    const result = await critique("ecommerce-bad.json");
    assert.equal(result.status, "ok");
    assert.equal(result.criticKind, "heuristic-deterministic");
    assert.match(result.disclaimer, /NÃO é um segundo LLM/);
    const titles = result.findings.map((f) => f.title);
    assert.ok(result.findings.some((f) => f.severity === "critical"));
    assert.ok(titles.some((t) => /cartão/i.test(t)));
    assert.ok(titles.some((t) => /autenticação|sessão/i.test(t)));
    assert.ok(titles.some((t) => /pressuposto/i.test(t)));
    for (const f of result.findings) {
      assert.match(f.stepId, /^s[0-9]+$/);
      assert.ok(["step", "constraint", "evidence", "context", "objective"].includes(f.sourceKind));
      assert.ok(f.citedEvidence.length >= 8);
      assert.ok(f.verificationAction.length >= 8);
      assert.ok(f.hypothesis.length >= 8);
    }
  });

  it("cartão e autenticação não se ancoram no catálogo e1 irrelevante", async () => {
    const result = await critique("ecommerce-bad.json");
    const catalog = "Catálogo sintético com três SKUs têxteis";
    const card = result.findings.find((f) => /Armazenamento de dados de cartão/.test(f.title));
    const auth = result.findings.find((f) => /Checkout sem passo de autenticação/.test(f.title));
    assert.ok(card);
    assert.equal(card.sourceKind, "step");
    assert.equal(card.sourceId, "s2");
    assert.equal(card.proofKind, "observed-excerpt");
    assert.match(card.citedEvidence, /localStorage/i);
    assert.match(card.citedEvidence, /cartão/i);
    assert.equal(card.citedEvidence.includes(catalog), false);
    assert.equal(card.sourceId === "e1", false);

    assert.ok(auth);
    assert.equal(auth.sourceKind, "step");
    assert.equal(auth.sourceId, "s3");
    assert.equal(auth.proofKind, "inferred-absence");
    assert.match(auth.citedEvidence, /pagamento|cobrar|cartão/i);
    assert.equal(auth.citedEvidence.includes(catalog), false);
    assert.match(auth.hypothesis, /inferência|ausência/i);
  });

  it("plano corrigido fica sem achados neste recorte (não é precisão universal)", async () => {
    const bad = await critique("ecommerce-bad.json");
    const fixed = await critique("ecommerce-fixed.json");
    assert.equal(fixed.status, "ok");
    assert.ok(bad.findings.length > 0);
    assert.equal(fixed.findings.length, 0);
  });

  it("plano bom não gera achados neste recorte (não é ausência de falso positivo universal)", async () => {
    const good = await critique("ecommerce-good.json");
    assert.equal(good.status, "ok");
    assert.equal(good.findings.length, 0);
  });

  it("injeção literal não é seguida e vira achado de risco", async () => {
    const raw = loadFixture("prompt-injection.json") as Record<string, unknown>;
    assert.equal(raw.approve, true);
    const input = validatePlanInput(raw);
    assert.equal("approve" in input, false);
    assert.equal("systemOverride" in input, false);
    const result = await runCritique(raw, { provider: createHeuristicProvider() });
    assert.equal(result.status, "ok");
    assert.ok(result.findings.some((f) => /injeção|instrução/i.test(f.title)));
    assert.ok(result.disclaimer.includes("NÃO aprovam"));
  });

  it("replay devolve a mesma estrutura da heurística", () => {
    const input = validatePlanInput(loadFixture("ecommerce-bad.json"));
    const a = runHeuristic(input);
    const b = runHeuristic(input);
    assert.deepEqual(a, b);
  });
});

describe("fixtures persistidas", () => {
  it("arquivos JSON de exemplo existem e o ruim difere do corrigido", () => {
    const bad = readFileSync(new URL("../fixtures/ecommerce-bad.json", import.meta.url), "utf8");
    const fixed = readFileSync(new URL("../fixtures/ecommerce-fixed.json", import.meta.url), "utf8");
    assert.notEqual(bad, fixed);
  });
});
