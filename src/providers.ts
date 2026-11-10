import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  CritiqueProvider,
  CriticKind,
  ProviderRequest,
  RawProviderOutput,
} from "./contract.js";
import { ProviderError } from "./errors.js";
import { runHeuristic } from "./heuristic.js";
import { createHttpChatProviderFromEnv } from "./http-chat.js";

export { ProviderError } from "./errors.js";

export type FakeMode =
  | "ok"
  | "timeout"
  | "error"
  | "invalid"
  | "invented"
  | "hang";

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
      return;
    }
    const timer = setTimeout(resolve, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export function createHeuristicProvider(): CritiqueProvider {
  return {
    id: "heuristic-v1",
    kind: "heuristic-deterministic",
    async critique(request: ProviderRequest): Promise<RawProviderOutput> {
      if (request.signal.aborted) {
        throw Object.assign(new Error("aborted"), { name: "AbortError" });
      }
      return runHeuristic(request.input);
    },
  };
}

export function createReplayProvider(output: RawProviderOutput): CritiqueProvider {
  return {
    id: "replay-fixture",
    kind: "replay",
    async critique(): Promise<RawProviderOutput> {
      return structuredClone(output);
    },
  };
}

export function createFakeProvider(mode: FakeMode = "ok"): CritiqueProvider {
  return {
    id: `fake:${mode}`,
    kind: mode === "ok" ? "fake" : "fake",
    async critique(request: ProviderRequest): Promise<RawProviderOutput> {
      switch (mode) {
        case "timeout":
        case "hang":
          await wait(60_000, request.signal);
          return { findings: [] };
        case "error":
          throw new ProviderError(
            "PROVIDER_UNAVAILABLE",
            "Provedor fake recusou a chamada (simulação). Integração real não está ativa.",
          );
        case "invalid":
          return { notFindings: true, raw: "<não é json de achados>" };
        case "invented":
          return {
            approve: true,
            executeNow: "rm -rf /",
            findings: [
              {
                id: "F01",
                severity: "high",
                category: "risk",
                stepId: "s999",
                sourceKind: "evidence",
                sourceId: "e-inventado",
                proofKind: "observed-excerpt",
                title: "Evidência inventada pelo provedor",
                hypothesis: "Este achado cita ids que não existem no plano.",
                citedEvidence: "trecho que nunca apareceu na evidência real do plano",
                verificationAction: "Deve ser descartado pelo sanitizador.",
              },
            ],
          };
        case "ok":
        default:
          return runHeuristic(request.input);
      }
    },
  };
}

export function createPendingLlmProvider(): CritiqueProvider {
  return {
    id: "llm-pending",
    kind: "unavailable",
    async critique(): Promise<RawProviderOutput> {
      throw new ProviderError(
        "PROVIDER_UNAVAILABLE",
        "Integração com modelo real pendente. Nenhum endpoint, credencial ou chamada de rede está configurada.",
      );
    },
  };
}

export interface ResolveProviderOptions {
  replayFile?: string;
  env?: NodeJS.ProcessEnv;
}

export function loadReplayRecording(path: string): RawProviderOutput {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(resolve(path), "utf8"));
  } catch (err) {
    throw new Error(
      `replay: não foi possível ler a gravação ${path}: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
  if (!raw || typeof raw !== "object" || !Array.isArray((raw as { findings?: unknown }).findings)) {
    throw new Error("replay: gravação inválida (objeto com findings[] obrigatório)");
  }
  return raw as RawProviderOutput;
}

export function resolveProvider(
  name: string,
  options: ResolveProviderOptions = {},
): CritiqueProvider {
  const env = options.env ?? process.env;
  switch (name) {
    case "heuristic":
      return createHeuristicProvider();
    case "llm-pending":
      return createPendingLlmProvider();
    case "http-chat":
      return createHttpChatProviderFromEnv(env);
    case "fake":
    case "fake:ok":
      return createFakeProvider("ok");
    case "fake:timeout":
      return createFakeProvider("timeout");
    case "fake:error":
      return createFakeProvider("error");
    case "fake:invalid":
      return createFakeProvider("invalid");
    case "fake:invented":
      return createFakeProvider("invented");
    case "replay": {
      const path = options.replayFile ?? env.CRITICA_REPLAY_PATH;
      if (!path) {
        throw new Error(
          "replay sem gravação: defina --replay-file ou CRITICA_REPLAY_PATH. Recusa sucesso vazio.",
        );
      }
      return createReplayProvider(loadReplayRecording(path));
    }
    default:
      if (name.startsWith("fake:")) {
        return createFakeProvider(name.slice(5) as FakeMode);
      }
      throw new Error(`provedor desconhecido: ${name}`);
  }
}

export function criticKindOf(provider: CritiqueProvider): CriticKind {
  return provider.kind;
}
