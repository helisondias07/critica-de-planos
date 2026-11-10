import type { CritiqueResult } from "./contract.js";
import { CRITIC_KIND_LABEL } from "./defaults.js";
import { EXIT_CODES } from "./pipeline.js";

export function formatSummary(result: CritiqueResult): string {
  const counts = { critical: 0, high: 0, medium: 0, low: 0 };
  for (const f of result.findings) counts[f.severity] += 1;
  const kind = CRITIC_KIND_LABEL[result.criticKind];
  const lines = [
    "Crítica de planos — revisão de segunda etapa (não executa, não aprova)",
    `status: ${result.status}    exit: ${EXIT_CODES[result.status]}`,
    `crítico: ${kind}    provider: ${result.meta.providerId}`,
    "NÃO é segundo LLM. NÃO valida qualidade de IA. NÃO há hook/plan mode.",
    `chamadas: ${result.meta.callsUsed}/${result.meta.maxCalls}  retries: ${result.meta.retriesUsed}  timeout=${result.meta.timedOut}  abort=${result.meta.aborted}  dropped=${result.meta.droppedFindings}`,
    `achados: ${result.findings.length} (critical ${counts.critical}, high ${counts.high}, medium ${counts.medium}, low ${counts.low})`,
  ];
  if (result.error) {
    lines.push(`erro: ${result.error.code} — ${result.error.message}`);
  }
  for (const f of result.findings) {
    lines.push(
      `  [${f.severity}/${f.category}/${f.proofKind}] ${f.id} step=${f.stepId} origem=${f.sourceKind}:${f.sourceId} — ${f.title}`,
    );
  }
  lines.push(result.disclaimer);
  return lines.join("\n");
}
