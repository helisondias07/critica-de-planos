#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { DEFAULTS } from "./defaults.js";
import { formatSummary } from "./format.js";
import { exitCodeFor, runCritique } from "./pipeline.js";
import { resolveProvider } from "./providers.js";
import { critiqueOutputSchema, planInputSchema } from "./schema.js";

export interface CliFlags {
  inputPath?: string;
  provider: string;
  jsonOnly: boolean;
  summaryOnly: boolean;
  help: boolean;
  schema: boolean;
  maxCalls?: number;
  maxRetries?: number;
  totalTimeoutMs?: number;
  attemptTimeoutMs?: number;
  abortAfterMs?: number;
}

export function parseArgs(argv: string[]): CliFlags {
  const flags: CliFlags = {
    provider: "heuristic",
    jsonOnly: false,
    summaryOnly: false,
    help: false,
    schema: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i]!;
    const next = () => argv[++i];
    switch (arg) {
      case "-h":
      case "--help":
        flags.help = true;
        break;
      case "--schema":
        flags.schema = true;
        break;
      case "--json-only":
        flags.jsonOnly = true;
        break;
      case "--summary-only":
        flags.summaryOnly = true;
        break;
      case "--provider":
        flags.provider = next() ?? flags.provider;
        break;
      case "--max-calls":
        flags.maxCalls = Number(next());
        break;
      case "--retries":
        flags.maxRetries = Number(next());
        break;
      case "--timeout-ms":
        flags.totalTimeoutMs = Number(next());
        break;
      case "--attempt-timeout-ms":
        flags.attemptTimeoutMs = Number(next());
        break;
      case "--abort-after-ms":
        flags.abortAfterMs = Number(next());
        break;
      case "--input":
        flags.inputPath = next();
        break;
      default:
        if (!arg.startsWith("-") && !flags.inputPath) flags.inputPath = arg;
        else if (arg.startsWith("-")) {
          throw new Error(`flag desconhecida: ${arg}`);
        }
    }
  }
  return flags;
}

export const HELP = `critica-de-planos — crítica heurística de planos (JSON + CLI)

Uso:
  npm run cli -- --input fixtures/ecommerce-bad.json
  npm run cli -- fixtures/ecommerce-good.json --json-only

Flags:
  --input <arquivo.json>     Plano sintético (objective, steps, constraints, evidence)
  --provider heuristic|replay|fake|fake:timeout|fake:error|fake:invalid|fake:invented|llm-pending
  --max-calls N              default ${DEFAULTS.maxCalls}
  --retries N                default ${DEFAULTS.maxRetries}
  --timeout-ms N             timeout total, default ${DEFAULTS.totalTimeoutMs}
  --attempt-timeout-ms N     default ${DEFAULTS.attemptTimeoutMs}
  --abort-after-ms N         cancela o ciclo (AbortController)
  --json-only                só JSON em stdout (sem resumo)
  --summary-only             só resumo em stderr (sem JSON)
  --schema                   imprime JSON Schema em stdout
  --help

Streams:
  stdout = JSON do contrato (exceto --summary-only e --help)
  stderr = resumo legível (exceto --json-only)

Exit codes:
  0 ok | 1 inesperado | 2 input_error | 3 unavailable | 4 invalid

Este CLI NÃO é hook do Cursor, NÃO usa Plan Mode, NÃO chama modelo real
e NÃO executa os achados. O crítico padrão é heurístico determinístico.
`;

export async function runCli(argv: string[], io = { stdout: process.stdout, stderr: process.stderr }): Promise<number> {
  let flags: CliFlags;
  try {
    flags = parseArgs(argv);
  } catch (err) {
    io.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }

  if (flags.help) {
    io.stdout.write(HELP);
    return 0;
  }
  if (flags.schema) {
    io.stdout.write(
      JSON.stringify({ planInput: planInputSchema, critiqueOutput: critiqueOutputSchema }, null, 2) + "\n",
    );
    return 0;
  }
  if (!flags.inputPath) {
    io.stderr.write("informe --input <arquivo.json> (ou --help)\n");
    return 2;
  }

  let raw: unknown;
  try {
    const text = readFileSync(resolve(flags.inputPath), "utf8");
    raw = JSON.parse(text);
  } catch (err) {
    const result = {
      status: "input_error" as const,
      criticKind: "unavailable" as const,
      disclaimer:
        "Falha ao ler/parsear o arquivo de entrada. NÃO é segundo LLM.",
      findings: [],
      error: {
        code: "INPUT_ERROR",
        message: err instanceof Error ? err.message : String(err),
      },
      meta: {
        providerId: "none",
        criticKind: "unavailable" as const,
        callsUsed: 0,
        maxCalls: flags.maxCalls ?? DEFAULTS.maxCalls,
        retriesUsed: 0,
        timedOut: false,
        aborted: false,
        droppedFindings: 0,
        ignoredUnexpectedFields: [],
      },
    };
    if (!flags.summaryOnly) io.stdout.write(JSON.stringify(result, null, 2) + "\n");
    if (!flags.jsonOnly) io.stderr.write("erro de entrada: arquivo JSON ilegível ou ausente\n");
    return 2;
  }

  let provider;
  try {
    provider = resolveProvider(flags.provider);
  } catch (err) {
    io.stderr.write(`${err instanceof Error ? err.message : String(err)}\n`);
    return 1;
  }

  const result = await runCritique(raw, {
    provider,
    maxCalls: flags.maxCalls,
    maxRetries: flags.maxRetries,
    totalTimeoutMs: flags.totalTimeoutMs,
    attemptTimeoutMs: flags.attemptTimeoutMs,
    abortAfterMs: flags.abortAfterMs,
  });

  if (!flags.summaryOnly) {
    io.stdout.write(JSON.stringify(result, null, 2) + "\n");
  }
  if (!flags.jsonOnly) {
    io.stderr.write(formatSummary(result) + "\n");
  }
  return exitCodeFor(result.status);
}

const isDirect = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isDirect) {
  runCli(process.argv.slice(2)).then((code) => {
    process.exit(code);
  });
}
