/**
 * Servidor MCP stdio (JSON-RPC 2.0, mensagens delimitadas por newline).
 * Spec: https://modelcontextprotocol.org/specification/2025-11-25/basic/transports
 * Não é hook de Plan Mode nem gate de execução.
 */
import { resolveProvider } from "./providers.js";
import { runCritique } from "./pipeline.js";
import { planInputSchema } from "./schema.js";

export const MCP_PROTOCOL_VERSION = "2025-11-25";

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

const TOOL_NAME = "critique_plan";

const TOOL_DEF = {
  name: TOOL_NAME,
  description:
    "Segunda passagem de crítica sobre um plano JSON. Manual: o host chama a ferramenta. Não captura Plan Mode, não autoriza Build, não executa o plano.",
  inputSchema: {
    type: "object",
    additionalProperties: false,
    required: ["plan"],
    properties: {
      plan: planInputSchema,
      provider: {
        type: "string",
        description:
          "heuristic | fake | replay | http-chat | llm-pending. Default heuristic. http-chat não cai para heurística se estiver desligado.",
      },
    },
  },
};

function encode(msg: unknown): string {
  return JSON.stringify(msg);
}

export async function handleMcpMessage(
  raw: JsonRpcRequest,
  write: (msg: JsonRpcResponse | Record<string, unknown>) => void,
): Promise<void> {
  if (raw.jsonrpc !== "2.0" || !raw.method) {
    if (raw.id !== undefined) {
      write({ jsonrpc: "2.0", id: raw.id, error: { code: -32600, message: "JSON-RPC inválido" } });
    }
    return;
  }

  if (raw.method === "notifications/initialized" || raw.method.startsWith("notifications/")) {
    return;
  }

  if (raw.id === undefined) return;

  if (raw.method === "initialize") {
    write({
      jsonrpc: "2.0",
      id: raw.id,
      result: {
        protocolVersion: MCP_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: { name: "critica-de-planos", version: "0.2.0" },
        instructions:
          "Chame critique_plan manualmente com o plano estruturado. Isto não é Plan→Build nem execução.",
      },
    });
    return;
  }

  if (raw.method === "ping") {
    write({ jsonrpc: "2.0", id: raw.id, result: {} });
    return;
  }

  if (raw.method === "tools/list") {
    write({ jsonrpc: "2.0", id: raw.id, result: { tools: [TOOL_DEF] } });
    return;
  }

  if (raw.method === "tools/call") {
    const params = (raw.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
    if (params.name !== TOOL_NAME) {
      write({
        jsonrpc: "2.0",
        id: raw.id,
        result: {
          content: [{ type: "text", text: `ferramenta desconhecida: ${params.name ?? ""}` }],
          isError: true,
        },
      });
      return;
    }
    const args = params.arguments ?? {};
    const providerName =
      typeof args.provider === "string"
        ? args.provider
        : (process.env.CRITICA_MCP_PROVIDER ?? "heuristic");
    let provider;
    try {
      provider = resolveProvider(providerName);
    } catch (err) {
      write({
        jsonrpc: "2.0",
        id: raw.id,
        result: {
          content: [{ type: "text", text: err instanceof Error ? err.message : String(err) }],
          isError: true,
        },
      });
      return;
    }
    const result = await runCritique(args.plan, { provider });
    const text = JSON.stringify(result);
    write({
      jsonrpc: "2.0",
      id: raw.id,
      result: {
        content: [{ type: "text", text }],
        isError: result.status === "input_error",
        structuredContent: result,
      },
    });
    return;
  }

  write({
    jsonrpc: "2.0",
    id: raw.id,
    error: { code: -32601, message: `método não suportado: ${raw.method}` },
  });
}

export function parseRpcLine(line: string): JsonRpcRequest | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  const parsed = JSON.parse(trimmed) as JsonRpcRequest;
  return parsed;
}

export { encode as encodeMcpMessage };
