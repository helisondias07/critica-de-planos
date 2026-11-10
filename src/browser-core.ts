/**
 * Superfície do núcleo segura para o browser: heurística, fake local, pipeline.
 * Não importa http-chat, MCP, CLI, filesystem nem process.env de credenciais.
 */
export { runCritique } from "./pipeline.js";
export { createFakeProvider, createHeuristicProvider, resolveLocalProvider } from "./local-providers.js";
export type { CritiqueResult, Finding, PlanInput } from "./contract.js";
