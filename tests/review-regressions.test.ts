import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PassThrough } from "node:stream";
import { after, describe, it } from "node:test";
import type { Server } from "node:http";
import { runCli } from "../src/cli.ts";
import { PACKAGE_VERSION } from "../src/version.ts";
import { httpChatConfigFromEnv, createHttpChatProvider } from "../src/http-chat.ts";
import { parseRetryAfterHeader } from "../src/retry-after.ts";
import { loadFixture } from "../src/fixtures.ts";
import { runCritique } from "../src/pipeline.ts";
import { resolveProvider } from "../src/providers.ts";
import { handleMcpMessage, handleStdioLine, MCP_PROTOCOL_VERSION, JSON_RPC_PARSE_ERROR } from "../src/mcp-server.ts";
import { attachStdio } from "../src/mcp-stdio.ts";
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

function close(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

async function runMode(
  mode: LoopMode,
  extra: {
    testAuthorization?: string;
    maxRetries?: number;
    dialect?: "openai-chat-completions" | "ollama-chat";
    totalTimeoutMs?: number;
    attemptTimeoutMs?: number;
  } = {},
) {
  const { server, baseUrl, state } = await startLoopback(mode, valid);
  const dialect = extra.dialect ?? "openai-chat-completions";
  const endpoint = dialect === "ollama-chat" ? baseUrl.replace(/\/v1$/, "") : baseUrl;
  const provider = createHttpChatProvider({
    enabled: true,
    dialect,
    endpoint,
    model: "mock-model",
    testAuthorization: extra.testAuthorization,
    maxTokens: 64,
    timeoutMs: 200,
    maxResponseBytes: 65_536,
    loopbackMock: true,
  });
  const started = Date.now();
  const result = await runCritique(loadFixture("timeout-lab.json"), {
    provider,
    maxRetries: extra.maxRetries ?? 0,
    attemptTimeoutMs: extra.attemptTimeoutMs ?? 250,
    totalTimeoutMs: extra.totalTimeoutMs ?? 400,
  });
  return { server, result, state, elapsed: Date.now() - started };
}

describe("P1/P2 regressões da revisão 803eeb4", () => {
  const servers: Server[] = [];
  after(async () => {
    for (const s of servers) await close(s);
  });

  it("P1.1 JSON malformado é invalid sem retry", async () => {
    const { server, result, state } = await runMode("malformed", { maxRetries: 3, totalTimeoutMs: 2000 });
    servers.push(server);
    assert.equal(result.status, "invalid");
    assert.equal(result.error?.code, "INVALID_OUTPUT");
    assert.equal(result.findings.length, 0);
    assert.equal(result.meta.callsUsed, 1);
    assert.equal(result.meta.retriesUsed, 0);
    assert.equal(state.hits, 1);
  });

  it("P1.2 401 nunca reintenta", async () => {
    const { server, result, state } = await runMode("unauth", { maxRetries: 3, totalTimeoutMs: 2000 });
    servers.push(server);
    assert.equal(result.status, "unavailable");
    assert.match(result.error?.message ?? "", /401/);
    assert.equal(result.meta.callsUsed, 1);
    assert.equal(result.meta.retriesUsed, 0);
    assert.equal(state.hits, 1);
  });

  it("P1.2 429 com Retry-After 0 reintenta uma vez e obtém ok", async () => {
    const { server, result, state } = await runMode("http429-then-ok", {
      maxRetries: 1,
      totalTimeoutMs: 2000,
    });
    servers.push(server);
    assert.equal(result.status, "ok");
    assert.equal(state.hits, 2);
    assert.equal(result.meta.retriesUsed, 1);
    assert.equal(result.findings.length, 1);
  });

  it("P1.2 Retry-After maior que o orçamento falha rápido", async () => {
    const { server, result, elapsed, state } = await runMode("http429-long", {
      maxRetries: 2,
      totalTimeoutMs: 400,
    });
    servers.push(server);
    assert.equal(result.status, "unavailable");
    assert.match(result.error?.message ?? "", /HTTP 429: Retry-After/);
    assert.equal(state.hits, 1);
    assert.equal(result.meta.callsUsed, 1);
    assert.ok(elapsed < 2000, `esperou demais: ${elapsed}ms`);
  });

  it("P1.3 MCP critique_plan isError em NOT_CONFIGURED/unavailable/invalid", async () => {
    const replies: unknown[] = [];
    await handleMcpMessage(
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: {
          name: "critique_plan",
          arguments: { plan: loadFixture("ecommerce-bad.json"), provider: "http-chat" },
        },
      },
      (msg) => replies.push(msg),
    );
    const call = replies[0] as {
      result: {
        isError: boolean;
        content: { text: string }[];
        structuredContent: { status: string; error?: { code: string } };
      };
    };
    assert.equal(call.result.isError, true);
    assert.equal(call.result.structuredContent.status, "unavailable");
    assert.equal(call.result.structuredContent.error?.code, "NOT_CONFIGURED");
    const payload = JSON.parse(call.result.content[0]!.text);
    assert.equal(payload.code, "NOT_CONFIGURED");
    assert.equal(payload.status, "unavailable");

    const invalidReplies: unknown[] = [];
    await handleMcpMessage(
      {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: {
          name: "critique_plan",
          arguments: { plan: loadFixture("timeout-lab.json"), provider: "fake:invalid" },
        },
      },
      (msg) => invalidReplies.push(msg),
    );
    const inv = invalidReplies[0] as { result: { isError: boolean; structuredContent: { status: string } } };
    assert.equal(inv.result.isError, true);
    assert.equal(inv.result.structuredContent.status, "invalid");
  });

  it("P2.6 replay sem gravação falha; com arquivo reproduz achados", async () => {
    assert.throws(() => resolveProvider("replay"), /replay sem gravação/);
    const provider = resolveProvider("replay", { replayFile: "fixtures/replay-sample.json" });
    const result = await runCritique(loadFixture("timeout-lab.json"), { provider });
    assert.equal(result.status, "ok");
    assert.equal(result.criticKind, "replay");
    assert.equal(result.findings.length, 1);
    assert.equal(result.findings[0]?.title, "gravação de replay");
  });

  it("P2.6 CLI --provider replay sem arquivo não imprime sucesso vazio", async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    stdout.on("data", (c) => chunks.push(Buffer.from(c)));
    stderr.on("data", (c) => errChunks.push(Buffer.from(c)));
    const code = await runCli(
      ["--input", "fixtures/timeout-lab.json", "--provider", "replay", "--json-only"],
      { stdout, stderr },
    );
    stdout.end();
    stderr.end();
    assert.equal(code, 1);
    assert.equal(Buffer.concat(chunks).toString("utf8"), "");
    assert.match(Buffer.concat(errChunks).toString("utf8"), /replay sem gravação/);
  });

  it("P2.10 versão MCP initialize = package.json", async () => {
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
      version: string;
    };
    assert.equal(pkg.version, PACKAGE_VERSION);
    const replies: unknown[] = [];
    await handleMcpMessage(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "t", version: "0" } },
      },
      (msg) => replies.push(msg),
    );
    const init = replies[0] as { result: { serverInfo: { version: string } } };
    assert.equal(init.result.serverInfo.version, PACKAGE_VERSION);
  });

  it("P2.11 0/negativo/NaN em MAX_TOKENS são erro de configuração", () => {
    assert.throws(() => httpChatConfigFromEnv({ CRITICA_LLM_MAX_TOKENS: "0" } as NodeJS.ProcessEnv), /CRITICA_LLM_MAX_TOKENS/);
    assert.throws(() => httpChatConfigFromEnv({ CRITICA_LLM_MAX_TOKENS: "-8" } as NodeJS.ProcessEnv), /CRITICA_LLM_MAX_TOKENS/);
    assert.throws(() => httpChatConfigFromEnv({ CRITICA_LLM_MAX_TOKENS: "abc" } as NodeJS.ProcessEnv), /CRITICA_LLM_MAX_TOKENS/);
    assert.equal(httpChatConfigFromEnv({} as NodeJS.ProcessEnv).maxTokens, 800);
  });

  it("P2.12 dialeto Ollama /api/chat no loopback falso", async () => {
    const { server, result, state } = await runMode("ollama-ok", {
      dialect: "ollama-chat",
      maxRetries: 0,
    });
    servers.push(server);
    assert.equal(result.status, "ok");
    assert.equal(result.meta.transport, "loopback-mock");
    assert.match(state.lastUrl ?? "", /\/api\/chat/);
    const body = state.lastBody as { stream?: boolean; format?: unknown; messages?: unknown[] };
    assert.equal(body.stream, false);
    assert.ok(body.format);
    assert.ok(Array.isArray(body.messages));
    assert.equal(result.findings.length, 1);
  });

  it("P2.9 JSON inválido no stdio responde -32700 e processa a linha seguinte em ordem", async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const lines: string[] = [];
    let buf = "";
    stdout.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        lines.push(buf.slice(0, idx));
        buf = buf.slice(idx + 1);
      }
    });
    const rl = attachStdio(stdin, stdout);
    stdin.write("isto não é json\n");
    stdin.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "t", version: "0" } },
      }) + "\n",
    );
    const deadline = Date.now() + 4000;
    while (lines.length < 2 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 20));
    }
    stdin.end();
    rl.close();
    assert.equal(lines.length >= 2, true, `linhas: ${lines.join(" | ")}`);
    const parseErr = JSON.parse(lines[0]!);
    assert.equal(parseErr.error.code, JSON_RPC_PARSE_ERROR);
    assert.equal(parseErr.id, null);
    const init = JSON.parse(lines[1]!);
    assert.equal(init.id, 1);
    assert.equal(init.result.serverInfo.version, PACKAGE_VERSION);
  });

  it("P2.9 fila stdio: ping não passa à frente de tools/call", async () => {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const lines: string[] = [];
    let buf = "";
    stdout.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        lines.push(buf.slice(0, idx));
        buf = buf.slice(idx + 1);
      }
    });
    const rl = attachStdio(stdin, stdout);
    stdin.write(
      JSON.stringify({
        jsonrpc: "2.0",
        id: "slow",
        method: "tools/call",
        params: {
          name: "critique_plan",
          arguments: { plan: loadFixture("ecommerce-bad.json"), provider: "heuristic" },
        },
      }) + "\n",
    );
    stdin.write(JSON.stringify({ jsonrpc: "2.0", id: "fast", method: "ping" }) + "\n");
    const deadline = Date.now() + 8000;
    while (lines.length < 2 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 20));
    }
    stdin.end();
    rl.close();
    assert.equal(lines.length, 2, `linhas: ${lines.join(" | ")}`);
    assert.equal(JSON.parse(lines[0]!).id, "slow");
    assert.equal(JSON.parse(lines[1]!).id, "fast");
  });

  it("Retry-After HTTP-date e segundos", () => {
    assert.equal(parseRetryAfterHeader("2"), 2000);
    assert.equal(parseRetryAfterHeader(""), undefined);
    const future = new Date(Date.now() + 5000).toUTCString();
    const ms = parseRetryAfterHeader(future);
    assert.ok(ms !== undefined && ms > 1000 && ms < 8000);
  });
});
