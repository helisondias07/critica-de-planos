import type {
  CritiqueProvider,
  CriticKind,
  PlanInput,
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

export function resolveProvider(
  name: string,
  inputForReplay?: PlanInput,
): CritiqueProvider {
  switch (name) {
    case "heuristic":
      return createHeuristicProvider();
    case "llm-pending":
      return createPendingLlmProvider();
    case "http-chat":
      return createHttpChatProviderFromEnv();
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
    case "replay":
      if (!inputForReplay) return createReplayProvider({ findings: [] });
      return createReplayProvider(runHeuristic(inputForReplay));
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
