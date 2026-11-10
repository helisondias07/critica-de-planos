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
      assert.match(f.evidenceId, /^e[0-9]+$/);
      assert.ok(f.verificationAction.length >= 8);
      assert.ok(f.hypothesis.length >= 8);
    }
  });

  it("no plano corrigido, some o armazenamento de cartão e o checkout sem sessão", async () => {
    const bad = await critique("ecommerce-bad.json");
    const fixed = await critique("ecommerce-fixed.json");
    assert.equal(fixed.status, "ok");
    const badTitles = bad.findings.map((f) => f.title).join(" | ");
    const fixedTitles = fixed.findings.map((f) => f.title).join(" | ");
    assert.match(badTitles, /cartão/i);
    assert.doesNotMatch(fixedTitles, /Armazenamento de dados de cartão/);
    assert.doesNotMatch(fixedTitles, /Checkout sem passo de autenticação/);
    // Avaliação qualitativa do par, sem métrica de precisão inventada.
    assert.ok(
      bad.findings.filter((f) => f.severity === "critical" || f.severity === "high").length >
        fixed.findings.filter((f) => f.severity === "critical" || f.severity === "high").length,
    );
  });

  it("plano bom não gera critical/high neste recorte (não é ausência de falso positivo universal)", async () => {
    const good = await critique("ecommerce-good.json");
    assert.equal(good.status, "ok");
    const severe = good.findings.filter((f) => f.severity === "critical" || f.severity === "high");
    assert.equal(severe.length, 0);
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
