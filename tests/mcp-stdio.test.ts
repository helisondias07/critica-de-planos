import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import { handleMcpMessage, MCP_PROTOCOL_VERSION } from "../src/mcp-server.ts";
import { loadFixture } from "../src/fixtures.ts";

describe("MCP JSON-RPC in-process", () => {
  it("initialize, tools/list e tools/call com heuristic", async () => {
    const replies: unknown[] = [];
    const write = (msg: unknown) => replies.push(msg);
    await handleMcpMessage(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "test", version: "0" } },
      },
      write,
    );
    const init = replies[0] as { result: { protocolVersion: string; capabilities: { tools: object } } };
    assert.equal(init.result.protocolVersion, MCP_PROTOCOL_VERSION);
    assert.ok(init.result.capabilities.tools);

    await handleMcpMessage({ jsonrpc: "2.0", method: "notifications/initialized" }, write);

    await handleMcpMessage({ jsonrpc: "2.0", id: 2, method: "tools/list" }, write);
    const listed = replies[1] as { result: { tools: { name: string }[] } };
    assert.equal(listed.result.tools[0]?.name, "critique_plan");

    await handleMcpMessage(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "critique_plan",
          arguments: { plan: loadFixture("ecommerce-bad.json"), provider: "heuristic" },
        },
      },
      write,
    );
    const call = replies[2] as {
      result: { isError: boolean; structuredContent: { findings: unknown[]; criticKind: string } };
    };
    assert.equal(call.result.isError, false);
    assert.equal(call.result.structuredContent.criticKind, "heuristic-deterministic");
    assert.equal(call.result.structuredContent.findings.length, 7);
  });

  it("tools/call com plano malformado marca isError", async () => {
    const replies: unknown[] = [];
    await handleMcpMessage(
      {
        jsonrpc: "2.0",
        id: 9,
        method: "tools/call",
        params: { name: "critique_plan", arguments: { plan: loadFixture("malformed.json") } },
      },
      (msg) => replies.push(msg),
    );
    const call = replies[0] as { result: { isError: boolean; structuredContent: { status: string } } };
    assert.equal(call.result.isError, true);
    assert.equal(call.result.structuredContent.status, "input_error");
  });

  it("http-chat via MCP não faz fallback silencioso", async () => {
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
        structuredContent: { status: string; error?: { code: string }; findings: unknown[] };
      };
    };
    assert.equal(call.result.isError, true);
    assert.equal(call.result.structuredContent.status, "unavailable");
    assert.equal(call.result.structuredContent.error?.code, "NOT_CONFIGURED");
    assert.equal(call.result.structuredContent.findings.length, 0);
  });
});

describe("MCP stdio subprocesso real", () => {
  it("initialize/tools-list/tools-call até o núcleo fake", async () => {
    const child = spawn("npx", ["tsx", "src/mcp-stdio.ts"], {
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, CRITICA_MCP_PROVIDER: "fake:ok" },
    });
    let buf = "";
    const lines: string[] = [];
    child.stdout.on("data", (chunk) => {
      buf += chunk.toString("utf8");
      let idx;
      while ((idx = buf.indexOf("\n")) >= 0) {
        lines.push(buf.slice(0, idx));
        buf = buf.slice(idx + 1);
      }
    });
    const waitLine = () =>
      new Promise<string>((resolve, reject) => {
        const t = setTimeout(() => reject(new Error("timeout stdout MCP")), 8000);
        const check = () => {
          if (lines.length) {
            clearTimeout(t);
            resolve(lines.shift()!);
          } else setTimeout(check, 20);
        };
        check();
      });
    const send = (obj: unknown) => child.stdin.write(JSON.stringify(obj) + "\n");
    try {
      send({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: { protocolVersion: MCP_PROTOCOL_VERSION, capabilities: {}, clientInfo: { name: "e2e", version: "0" } },
      });
      const init = JSON.parse(await waitLine());
      assert.equal(init.result.serverInfo.name, "critica-de-planos");
      send({ jsonrpc: "2.0", method: "notifications/initialized" });
      send({ jsonrpc: "2.0", id: 2, method: "tools/list" });
      const listed = JSON.parse(await waitLine());
      assert.equal(listed.result.tools[0].name, "critique_plan");
      send({
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: {
          name: "critique_plan",
          arguments: { plan: loadFixture("timeout-lab.json"), provider: "fake:invalid" },
        },
      });
      const called = JSON.parse(await waitLine());
      assert.equal(called.result.isError, true);
      const inner = JSON.parse(called.result.content[0].text);
      assert.equal(inner.status, "invalid");
      assert.equal(inner.code, "INVALID_OUTPUT");
      assert.equal(inner.result.findings.length, 0);
    } finally {
      child.kill("SIGTERM");
    }
  });
});
