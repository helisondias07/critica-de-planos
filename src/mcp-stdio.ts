#!/usr/bin/env node
/**
 * Entrada stdio MCP. Logs só em stderr. stdout é exclusivamente JSON-RPC.
 * Configuração de host: docs/examples/cursor-mcp.json.example (não instala plugin).
 */
import { createInterface } from "node:readline";
import { handleMcpMessage, parseRpcLine } from "./mcp-server.js";
import { logLine } from "./redact.js";

function writeStdout(msg: unknown): void {
  process.stdout.write(JSON.stringify(msg) + "\n");
}

logLine("mcp stdio ready", {
  tool: "critique_plan",
  note: "manual tool call only; not Plan Mode",
});

const rl = createInterface({ input: process.stdin, terminal: false });

rl.on("line", (line) => {
  void (async () => {
    try {
      const req = parseRpcLine(line);
      if (!req) return;
      await handleMcpMessage(req, writeStdout);
    } catch (err) {
      logLine("mcp line error", { message: err instanceof Error ? err.message : String(err) });
    }
  })();
});

rl.on("close", () => {
  process.exit(0);
});
