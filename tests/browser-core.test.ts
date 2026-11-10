import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { resolveLocalProvider } from "../src/local-providers.ts";
import { runCritique } from "../src/browser-core.ts";
import { loadFixture } from "../src/fixtures.ts";

describe("núcleo do browser (sem http-chat)", () => {
  it("resolveLocalProvider recusa http-chat", () => {
    assert.throws(() => resolveLocalProvider("http-chat"), /desconhecido/);
    assert.throws(() => resolveLocalProvider("replay"), /desconhecido/);
  });

  it("heurística no browser-core igual à do pipeline para o plano ruim", async () => {
    const provider = resolveLocalProvider("heuristic");
    const result = await runCritique(loadFixture("ecommerce-bad.json"), { provider });
    assert.equal(result.status, "ok");
    assert.equal(result.findings.length, 7);
    assert.equal(result.findings[0]?.id, "F01");
  });
});
