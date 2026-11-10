import assert from "node:assert/strict";
import { after, describe, it } from "node:test";
import type { Server } from "node:http";
import { loadFixture } from "../src/fixtures.ts";
import { createHttpChatProvider, createHttpChatProviderFromEnv } from "../src/http-chat.ts";
import { runCritique } from "../src/pipeline.ts";
import { startLoopback, type LoopMode } from "./loopback-openai.ts";

const valid = {
  findings: [
    {
      id: "F01",
      severity: "low",
      category: "gap",
      stepId: "s1",
      sourceKind: "step",
      sourceId: "s1",
      proofKind: "observed-excerpt",
      title: "mock loopback",
      hypothesis: "resposta de servidor HTTP local falso, não é LLM",
      citedEvidence: "Não deve ser executado",
      verificationAction: "tratar como mock de transporte",
    },
  ],
};

async function runMode(mode: LoopMode, extra: { testAuthorization?: string } = {}) {
  const { server, baseUrl, state } = await startLoopback(mode, valid);
  const provider = createHttpChatProvider({
    enabled: true,
    dialect: "openai-chat-completions",
    endpoint: baseUrl,
    model: "mock-model",
    testAuthorization: extra.testAuthorization,
    maxTokens: 64,
    timeoutMs: 200,
    maxResponseBytes: 65_536,
    loopbackMock: true,
  });
  const result = await runCritique(loadFixture("timeout-lab.json"), {
    provider,
    maxRetries: 0,
    attemptTimeoutMs: 250,
    totalTimeoutMs: 400,
  });
  return { server, result, state, baseUrl };
}

function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

describe("http-chat (loopback falso, NÃO é LLM)", () => {
  const servers: Server[] = [];
  after(async () => {
    for (const s of servers) await close(s);
  });

  it("sem enable/endpoint fica not_configured e NÃO cai para heurística", async () => {
    const result = await runCritique(loadFixture("ecommerce-bad.json"), {
      provider: createHttpChatProviderFromEnv({}),
      maxRetries: 0,
    });
    assert.equal(result.status, "unavailable");
    assert.equal(result.error?.code, "NOT_CONFIGURED");
    assert.equal(result.meta.blockReason, "not_configured");
    assert.equal(result.findings.length, 0);
    assert.equal(result.criticKind, "http-chat");
  });

  it("loopback ok envia Authorization sintético e devolve findings sanitizados", async () => {
    const { server, result, state } = await runMode("ok", {
      testAuthorization: "Bearer test-token-not-a-secret",
    });
    servers.push(server);
    assert.equal(result.status, "ok");
    assert.equal(result.criticKind, "fake");
    assert.equal(result.meta.transport, "loopback-mock");
    assert.equal(result.meta.model, "mock-model");
    assert.equal(state.lastAuth, "Bearer test-token-not-a-secret");
    assert.equal(result.findings.length, 1);
    const body = state.lastBody as { max_tokens?: number; messages?: unknown[] };
    assert.equal(body.max_tokens, 64);
    const user = JSON.stringify(body.messages);
    assert.match(user, /UNTRUSTED_PLAN_JSON_BEGIN/);
  });

  it("header ausente recebe 401 no modo unauth", async () => {
    const { server, result, state } = await runMode("unauth");
    servers.push(server);
    assert.equal(state.lastAuth, undefined);
    assert.equal(result.status, "unavailable");
    assert.match(result.error?.message ?? "", /401/);
  });

  it("HTTP 429 e 5xx viram unavailable", async () => {
    const a = await runMode("http429");
    servers.push(a.server);
    assert.equal(a.result.status, "unavailable");
    assert.match(a.result.error?.message ?? "", /429/);
    const b = await runMode("http500");
    servers.push(b.server);
    assert.match(b.result.error?.message ?? "", /500/);
  });

  it("JSON malformado vira invalid ou unavailable sem achados", async () => {
    const { server, result } = await runMode("malformed");
    servers.push(server);
    assert.ok(result.status === "invalid" || result.status === "unavailable");
    assert.equal(result.findings.length, 0);
  });

  it("timeout de transporte aborta", async () => {
    const { server, result } = await runMode("timeout");
    servers.push(server);
    assert.equal(result.status, "unavailable");
    assert.equal(result.meta.timedOut || result.meta.aborted, true);
  });

  it("injeção no JSON extra é ignorada; achado com citação válida no passo permanece", async () => {
    const { server, result } = await runMode("injection");
    servers.push(server);
    assert.equal(result.status, "ok");
    assert.ok(result.meta.ignoredUnexpectedFields.includes("approve"));
    assert.equal(result.findings.length, 1);
  });

  it("achados inventados são descartados", async () => {
    const { server, result } = await runMode("invented");
    servers.push(server);
    assert.equal(result.status, "ok");
    assert.equal(result.findings.length, 0);
    assert.ok(result.meta.droppedFindings >= 1);
  });

  it("ENABLED sem endpoint não chama rede e não usa heurística no plano ruim", async () => {
    const result = await runCritique(loadFixture("ecommerce-bad.json"), {
      provider: createHttpChatProviderFromEnv({
        CRITICA_LLM_ENABLED: "true",
        CRITICA_LLM_MODEL: "x",
      } as NodeJS.ProcessEnv),
      maxRetries: 0,
    });
    assert.equal(result.findings.length, 0);
    assert.equal(result.error?.code, "NOT_CONFIGURED");
  });
});
