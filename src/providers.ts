import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { CritiqueProvider, CriticKind, RawProviderOutput } from "./contract.js";
import { createHttpChatProviderFromEnv } from "./http-chat.js";
import {
  createFakeProvider,
  createHeuristicProvider,
  createPendingLlmProvider,
  type FakeMode,
} from "./local-providers.js";

export { ProviderError } from "./errors.js";
export {
  createFakeProvider,
  createHeuristicProvider,
  createPendingLlmProvider,
  resolveLocalProvider,
  type FakeMode,
} from "./local-providers.js";

export function createReplayProvider(output: RawProviderOutput): CritiqueProvider {
  return {
    id: "replay-fixture",
    kind: "replay",
    async critique(): Promise<RawProviderOutput> {
      return structuredClone(output);
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
