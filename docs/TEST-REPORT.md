# TEST-REPORT — Crítica de planos

Ambiente: Node `v22.23.4`, npm `10.9.9`. Heurística da fixture ruim: **7 achados** (F01–F07), contagem dinâmica. FIXED/GOOD: 0 achados neste recorte (não é acurácia).

Defaults do núcleo: maxCalls=3, maxRetries=1, totalTimeoutMs=8000, attemptTimeoutMs=2500.  
Overrides de demo/lab: 80/200/0.  
http-chat: maxTokens=800, timeout 8000, **enable default false**.

Fontes oficiais consultadas em 2026-11-10: ver `docs/INTEGRATION-PLAN.md`.

Contagem desta passagem: **45 testes, 45 pass, 0 fail.** Logs v2 em `/opt/cursor/artifacts/`. Pacote v1 `critica-de-planos-source.zip` preservado.

## O que foi testado (código)

- Typecheck/build
- Heurística, sanitizador, CLI/HTTP da bancada
- Teclado Chrome
- **http-chat loopback** (auth sintético, 401, 429, 5xx, timeout, malformado, injeção, inventados, NOT_CONFIGURED sem fallback)
- **MCP** in-process e subprocesso stdio (`initialize` / `tools/list` / `tools/call`) com heuristic/fake

**Não testado:** LLM real, Ollama com pesos, Cursor IDE, Claude Code como host, Plan Mode.

## Status

Parcial. Loopback HTTP é mock, não LLM.
