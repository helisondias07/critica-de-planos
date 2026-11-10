#!/usr/bin/env node
/**
 * Entrada stdio MCP. Logs só em stderr. stdout é exclusivamente JSON-RPC.
 * Configuração de host: docs/examples/cursor-mcp.json.example (não instala plugin).
 * Linhas processadas em ordem (fila); JSON inválido → -32700 Parse error (JSON-RPC 2.0).
 */
import { createInterface, type Interface as ReadlineInterface } from "node:readline";
import type { Readable, Writable } from "node:stream";
import { handleStdioLine } from "./mcp-server.js";
import { logLine } from "./redact.js";

export function writeStdout(msg: unknown, stdout: Writable = process.stdout): void {
  stdout.write(JSON.stringify(msg) + "\n");
}

export function attachStdio(stdin: Readable, stdout: Writable): ReadlineInterface {
  const rl = createInterface({ input: stdin, terminal: false });
  let queue: Promise<void> = Promise.resolve();
  rl.on("line", (line) => {
    queue = queue
      .then(() => handleStdioLine(line, (msg) => writeStdout(msg, stdout)))
      .catch((err) => {
        logLine("mcp line error", { message: err instanceof Error ? err.message : String(err) });
      });
  });
  return rl;
}

const startedDirectly = process.argv[1]?.endsWith("mcp-stdio.ts") || process.argv[1]?.endsWith("mcp-stdio.js");
if (startedDirectly) {
  logLine("mcp stdio ready", {
    tool: "critique_plan",
    note: "manual tool call only; not Plan Mode",
  });
  const rl = attachStdio(process.stdin, process.stdout);
  rl.on("close", () => {
    process.exit(0);
  });
}
