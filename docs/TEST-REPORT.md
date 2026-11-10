# TEST-REPORT — Crítica de planos

Ambiente típico: Node 20+ (verificado com v22). Heurística da fixture ruim: **7 achados** (F01–F07). FIXED/GOOD: 0 achados neste recorte (**não é acurácia**).

Defaults do núcleo: maxCalls=3, maxRetries=1, totalTimeoutMs=8000, attemptTimeoutMs=2500.  
http-chat: maxTokens=800, timeout 8000, **enable default false**. `CRITICA_LLM_MAX_TOKENS=0` com `--provider http-chat` → JSON `unavailable` / `NOT_CONFIGURED`, exit 3 (não cai no 800).

Este relatório **não grava SHAs**: qualquer hash escrito num commit fica defasado no seguinte. Ver `git log`.

## O que foi testado (código)

- `npm ci`, typecheck, build, `npm audit`
- Heurística, sanitizador, CLI/HTTP da bancada, teclado Chrome
- **http-chat loopback** (auth sintético, 401 sem retry, 429 + Retry-After, 5xx, timeout, malformado → `invalid` sem retry, injeção, inventados, NOT_CONFIGURED, **Ollama `/api/chat`**)
- **MCP** in-process, subprocesso stdio, parse `-32700`, fila de linhas, `isError` em falha de provedor
- Replay com e sem gravação
- Citação endurecida (NFKC, palavras, trivial)
- Stamp `/api/health` `transport=not-configured`
- Rótulo UI de `inferred-absence`
- CLI: env `CRITICA_LLM_MAX_TOKENS=0`

**Não testado:** LLM real, Ollama com pesos, Cursor IDE como host, Claude Code como host, Plan Mode, credenciais.

Loopback HTTP **é mock, não LLM**.

## Status

MVP honesto, **parcial** até E2E com modelo real e host real.
