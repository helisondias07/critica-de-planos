import type { CritiqueProvider, ProviderRequest, RawProviderOutput } from "./contract.js";
import { DEFAULTS } from "./defaults.js";
import { ProviderError } from "./errors.js";
import { buildUntrustedPlanUserMessage, CRITIC_SYSTEM_PROMPT, FINDINGS_JSON_SCHEMA, parseModelContent } from "./prompt.js";
import { endpointHost, logLine, redactHeaderValue } from "./redact.js";

export type HttpChatDialect = "openai-chat-completions" | "ollama-chat";

export interface HttpChatConfig {
  enabled: boolean;
  dialect: HttpChatDialect;
  endpoint: string;
  model: string;
  /** Nome da variável de ambiente que contém a credencial — nunca o valor. */
  apiKeyEnvName?: string;
  /** Só testes: token sintético, não é segredo de produção. */
  testAuthorization?: string;
  maxTokens: number;
  timeoutMs: number;
  maxResponseBytes: number;
  /** Marca loopback falso: NÃO é LLM. */
  loopbackMock: boolean;
}

export const HTTP_CHAT_DEFAULTS = {
  maxTokens: 800,
  timeoutMs: 8000,
  maxResponseBytes: 65_536,
  dialect: "openai-chat-completions" as HttpChatDialect,
};

export function httpChatConfigFromEnv(env: NodeJS.ProcessEnv = process.env): HttpChatConfig {
  const enabled = env.CRITICA_LLM_ENABLED === "true";
  const dialect =
    env.CRITICA_LLM_DIALECT === "ollama-chat" ? "ollama-chat" : "openai-chat-completions";
  const keyName = env.CRITICA_LLM_API_KEY_ENV?.trim();
  return {
    enabled,
    dialect,
    endpoint: (env.CRITICA_LLM_ENDPOINT ?? "").trim(),
    model: (env.CRITICA_LLM_MODEL ?? "").trim(),
    apiKeyEnvName: keyName || undefined,
    maxTokens: Number(env.CRITICA_LLM_MAX_TOKENS) || HTTP_CHAT_DEFAULTS.maxTokens,
    timeoutMs: Number(env.CRITICA_LLM_TIMEOUT_MS) || HTTP_CHAT_DEFAULTS.timeoutMs,
    maxResponseBytes: DEFAULTS.maxInputBytes,
    loopbackMock: false,
  };
}

function authorizationHeader(config: HttpChatConfig): string | undefined {
  if (config.testAuthorization) return config.testAuthorization;
  if (!config.apiKeyEnvName) return undefined;
  const value = process.env[config.apiKeyEnvName];
  if (!value) return undefined;
  return value.startsWith("Bearer ") ? value : `Bearer ${value}`;
}

function chatUrl(config: HttpChatConfig): string {
  const base = config.endpoint.replace(/\/$/, "");
  if (config.dialect === "ollama-chat") {
    return base.endsWith("/api/chat") ? base : `${base}/api/chat`;
  }
  if (base.endsWith("/chat/completions")) return base;
  return `${base}/chat/completions`;
}

function requestBody(config: HttpChatConfig, user: string): unknown {
  if (config.dialect === "ollama-chat") {
    return {
      model: config.model,
      stream: false,
      format: FINDINGS_JSON_SCHEMA,
      messages: [
        { role: "system", content: CRITIC_SYSTEM_PROMPT },
        { role: "user", content: user },
      ],
    };
  }
  return {
    model: config.model,
    max_tokens: config.maxTokens,
    stream: false,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "critique_findings",
        strict: true,
        schema: FINDINGS_JSON_SCHEMA,
      },
    },
    messages: [
      { role: "system", content: CRITIC_SYSTEM_PROMPT },
      { role: "user", content: user },
    ],
  };
}

function extractContent(dialect: HttpChatDialect, json: unknown): string {
  if (!json || typeof json !== "object") throw new ProviderError("INVALID_OUTPUT", "corpo HTTP não é objeto");
  const rec = json as Record<string, unknown>;
  if (dialect === "ollama-chat") {
    const msg = rec.message as Record<string, unknown> | undefined;
    if (typeof msg?.content === "string") return msg.content;
    throw new ProviderError("INVALID_OUTPUT", "resposta ollama sem message.content");
  }
  const choices = rec.choices;
  if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") {
    throw new ProviderError("INVALID_OUTPUT", "resposta chat/completions sem choices[0]");
  }
  const message = (choices[0] as Record<string, unknown>).message as Record<string, unknown> | undefined;
  if (typeof message?.content === "string") return message.content;
  throw new ProviderError("INVALID_OUTPUT", "resposta chat/completions sem message.content");
}

export function createHttpChatProvider(config: HttpChatConfig): CritiqueProvider {
  const host = config.endpoint ? endpointHost(config.endpoint) : "";
  const kind = config.loopbackMock ? "fake" : "http-chat";
  const id = config.loopbackMock ? "http-mock" : "http-chat";
  const transport = config.loopbackMock ? "loopback-mock" : "configured-http";

  return {
    id,
    kind,
    model: config.model || undefined,
    endpointHost: host || undefined,
    transport,
    async critique(request: ProviderRequest): Promise<RawProviderOutput> {
      if (!config.enabled || !config.endpoint || !config.model) {
        throw new ProviderError(
          "NOT_CONFIGURED",
          "http-chat desabilitado ou sem endpoint/model. Defina CRITICA_LLM_ENABLED=true, CRITICA_LLM_ENDPOINT e CRITICA_LLM_MODEL. Sem fallback para heurística.",
        );
      }
      let url: string;
      try {
        url = chatUrl(config);
        const parsed = new URL(url);
        if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
          throw new Error("protocolo");
        }
      } catch {
        throw new ProviderError("NOT_CONFIGURED", "CRITICA_LLM_ENDPOINT inválido");
      }

      const user = buildUntrustedPlanUserMessage(request.input);
      const headers: Record<string, string> = { "content-type": "application/json", accept: "application/json" };
      const auth = authorizationHeader(config);
      if (auth) headers.authorization = auth;

      logLine("http-chat request", {
        host: endpointHost(url),
        model: config.model,
        dialect: config.dialect,
        mock: config.loopbackMock,
        authorization: redactHeaderValue("authorization", auth ?? ""),
        maxTokens: config.maxTokens,
      });

      const timeout = AbortSignal.any
        ? AbortSignal.any([request.signal, AbortSignal.timeout(config.timeoutMs)])
        : request.signal;

      let response: Response;
      try {
        response = await fetch(url, {
          method: "POST",
          headers,
          body: JSON.stringify(requestBody(config, user)),
          signal: timeout,
        });
      } catch (err) {
        const name = err instanceof Error ? err.name : "";
        if (request.signal.aborted || name === "AbortError" || name === "TimeoutError") {
          throw Object.assign(new Error("aborted"), { name: "AbortError" });
        }
        throw new ProviderError("PROVIDER_UNAVAILABLE", `falha de transporte HTTP: ${(err as Error).message}`);
      }

      if (response.status === 429 || response.status >= 500) {
        throw new ProviderError(
          "PROVIDER_UNAVAILABLE",
          `HTTP ${response.status} no endpoint de crítica (não executar plano)`,
        );
      }
      if (!response.ok) {
        throw new ProviderError("PROVIDER_UNAVAILABLE", `HTTP ${response.status} no endpoint de crítica`);
      }

      const text = await response.text();
      if (text.length > config.maxResponseBytes) {
        throw new ProviderError("INVALID_OUTPUT", "payload de resposta acima do teto");
      }
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(text);
      } catch {
        throw new ProviderError("INVALID_OUTPUT", "resposta HTTP não é JSON");
      }
      let content: string;
      try {
        content = extractContent(config.dialect, parsedJson);
      } catch (err) {
        throw err;
      }
      try {
        const findingsDoc = parseModelContent(content, config.maxResponseBytes);
        if (!findingsDoc || typeof findingsDoc !== "object") {
          throw new Error("não objeto");
        }
        return findingsDoc as RawProviderOutput;
      } catch {
        throw new ProviderError("INVALID_OUTPUT", "conteúdo do modelo não é JSON de findings");
      }
    },
  };
}

export function createHttpChatProviderFromEnv(env: NodeJS.ProcessEnv = process.env): CritiqueProvider {
  return createHttpChatProvider(httpChatConfigFromEnv(env));
}
