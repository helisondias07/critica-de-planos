import type { CritiqueResult, RunOptions } from "./contract.js";
import { DEFAULTS, DISCLAIMER } from "./defaults.js";
import { isAbortError, messageOf, ProviderError } from "./errors.js";
import { InputValidationError, sanitizeProviderOutput, validatePlanInput } from "./validate.js";

function emptyMeta(options: RunOptions, extra: Partial<CritiqueResult["meta"]> = {}): CritiqueResult["meta"] {
  return {
    providerId: options.provider.id,
    criticKind: options.provider.kind,
    callsUsed: 0,
    maxCalls: options.maxCalls ?? DEFAULTS.maxCalls,
    retriesUsed: 0,
    timedOut: false,
    aborted: false,
    droppedFindings: 0,
    ignoredUnexpectedFields: [],
    model: options.provider.model,
    endpointHost: options.provider.endpointHost,
    transport: options.provider.transport,
    ...extra,
  };
}

export async function runCritique(raw: unknown, options: RunOptions): Promise<CritiqueResult> {
  const pick = (value: number | undefined, fallback: number) =>
    typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
  const maxCalls = pick(options.maxCalls, DEFAULTS.maxCalls);
  const maxRetries = pick(options.maxRetries, DEFAULTS.maxRetries);
  const totalTimeoutMs = pick(options.totalTimeoutMs, DEFAULTS.totalTimeoutMs);
  const attemptTimeoutMs = pick(options.attemptTimeoutMs, DEFAULTS.attemptTimeoutMs);

  const disclaimer = DISCLAIMER;

  try {
    validatePlanInput(raw);
  } catch (err) {
    const message = err instanceof InputValidationError ? err.message : messageOf(err);
    return {
      status: "input_error",
      criticKind: options.provider.kind,
      disclaimer,
      findings: [],
      error: { code: "INPUT_ERROR", message },
      meta: emptyMeta(options),
    };
  }

  const input = validatePlanInput(raw);

  if (maxCalls <= 0) {
    return {
      status: "unavailable",
      criticKind: "unavailable",
      disclaimer,
      findings: [],
      error: {
        code: "CALL_LIMIT",
        message: "maxCalls=0; nenhuma chamada ao crítico foi permitida.",
      },
      meta: emptyMeta(options, { criticKind: "unavailable" }),
    };
  }

  const totalController = new AbortController();
  const timers: ReturnType<typeof setTimeout>[] = [];

  const abortTotal = () => totalController.abort();
  timers.push(setTimeout(abortTotal, totalTimeoutMs));
  if (options.abortAfterMs !== undefined) {
    timers.push(setTimeout(abortTotal, options.abortAfterMs));
  }
  if (options.signal) {
    if (options.signal.aborted) totalController.abort();
    else options.signal.addEventListener("abort", abortTotal, { once: true });
  }

  let callsUsed = 0;
  let retriesUsed = 0;
  let timedOut = false;
  let aborted = false;
  let lastError = "crítico indisponível";
  let lastCode = "PROVIDER_UNAVAILABLE";

  const cleanup = () => {
    for (const t of timers) clearTimeout(t);
  };

  try {
    const attempts = Math.min(maxCalls, maxRetries + 1);
    for (let i = 0; i < attempts; i += 1) {
      if (totalController.signal.aborted) {
        aborted = true;
        timedOut = true;
        break;
      }
      if (callsUsed >= maxCalls) {
        lastError = "limite de chamadas atingido";
        break;
      }

      const attemptController = new AbortController();
      const onTotalAbort = () => attemptController.abort();
      totalController.signal.addEventListener("abort", onTotalAbort, { once: true });
      const attemptTimer = setTimeout(() => attemptController.abort(), attemptTimeoutMs);
      callsUsed += 1;
      if (i > 0) retriesUsed += 1;

      try {
        const rawOutput = await options.provider.critique({
          input,
          signal: attemptController.signal,
        });
        clearTimeout(attemptTimer);

        const sanitized = sanitizeProviderOutput(rawOutput, input);
        if (sanitized.structureInvalid) {
          return {
            status: "invalid",
            criticKind: options.provider.kind,
            disclaimer,
            findings: [],
            error: {
              code: "INVALID_OUTPUT",
              message:
                "Saída do crítico não passou na validação estrutural. Achados descartados. Não tratar como revisão.",
            },
            meta: {
              providerId: options.provider.id,
              criticKind: options.provider.kind,
              callsUsed,
              maxCalls,
              retriesUsed,
              timedOut: false,
              aborted: false,
              droppedFindings: sanitized.droppedFindings,
              ignoredUnexpectedFields: sanitized.ignoredUnexpectedFields,
              model: options.provider.model,
              endpointHost: options.provider.endpointHost,
              transport: options.provider.transport,
            },
          };
        }

        return {
          status: "ok",
          criticKind: options.provider.kind,
          disclaimer,
          findings: sanitized.findings,
          meta: {
            providerId: options.provider.id,
            criticKind: options.provider.kind,
            callsUsed,
            maxCalls,
            retriesUsed,
            timedOut: false,
            aborted: false,
            droppedFindings: sanitized.droppedFindings,
            ignoredUnexpectedFields: sanitized.ignoredUnexpectedFields,
            model: options.provider.model,
            endpointHost: options.provider.endpointHost,
            transport: options.provider.transport,
          },
        };
      } catch (err) {
        clearTimeout(attemptTimer);
        lastError = messageOf(err);
        if (err instanceof ProviderError) lastCode = err.code;
        if (isAbortError(err) || totalController.signal.aborted || attemptController.signal.aborted) {
          timedOut = true;
          aborted = totalController.signal.aborted || attemptController.signal.aborted;
        }
      }
    }

    const blockReason = lastCode === "NOT_CONFIGURED" ? "not_configured" : undefined;
    return {
      status: "unavailable",
      criticKind: options.provider.kind === "unavailable" ? "unavailable" : options.provider.kind,
      disclaimer,
      findings: [],
      error: {
        code: timedOut || aborted ? "TIMEOUT_OR_ABORT" : lastCode,
        message: lastError,
      },
      meta: {
        providerId: options.provider.id,
        criticKind: options.provider.kind,
        callsUsed,
        maxCalls,
        retriesUsed,
        timedOut,
        aborted,
        droppedFindings: 0,
        ignoredUnexpectedFields: [],
        model: options.provider.model,
        endpointHost: options.provider.endpointHost,
        transport: options.provider.transport,
        blockReason,
      },
    };
  } finally {
    cleanup();
  }
}

export const EXIT_CODES = {
  ok: 0,
  unexpected: 1,
  input_error: 2,
  unavailable: 3,
  invalid: 4,
} as const;

export function exitCodeFor(status: CritiqueResult["status"]): number {
  return EXIT_CODES[status] ?? EXIT_CODES.unexpected;
}
