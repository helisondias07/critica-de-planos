# TEST-REPORT — Crítica de planos (v3)

Ambiente: Node `v22.23.4`, npm `10.9.9`. Heurística da fixture ruim: **7 achados** (F01–F07). FIXED/GOOD: 0 achados neste recorte (**não é acurácia**).

Defaults do núcleo: maxCalls=3, maxRetries=1, totalTimeoutMs=8000, attemptTimeoutMs=2500.  
http-chat: maxTokens=800, timeout 8000, **enable default false**. `CRITICA_LLM_MAX_TOKENS=0` é erro de configuração (não cai no 800).

SHA anterior preservado: `803eeb4fe0f3a7f35245118995d0cbab47ef48e2`. SHA v3: `8b7748f30f53083de4c6fc0df7b0739d7c29a291`. Pacotes v1 e v2 em `/opt/cursor/artifacts/` **não** foram substituídos.

Fontes oficiais consultadas em **2026-11-10** (reconsulta nesta passagem): ver `docs/INTEGRATION-PLAN.md`.

Contagem REAL desta passagem (`npm test` após `npm ci`): **62 testes, 62 pass, 0 fail** (`test-output-v3.txt`).

## O que foi testado (código)

- `npm ci`, typecheck, build
- Heurística, sanitizador, CLI/HTTP da bancada, teclado Chrome
- **http-chat loopback** (auth sintético, 401 sem retry, 429 + Retry-After, 5xx, timeout, malformado → `invalid` sem retry, injeção, inventados, NOT_CONFIGURED, **Ollama `/api/chat`**)
- **MCP** in-process, subprocesso stdio, parse `-32700`, fila de linhas, `isError` em falha de provedor
- Replay com e sem gravação
- Citação endurecida (NFKC, palavras, trivial)
- Stamp `/api/health` `transport=not-configured`
- Rótulo UI de `inferred-absence`

**Não testado:** LLM real, Ollama com pesos, Cursor IDE como host, Claude Code como host, Plan Mode, credenciais.

Loopback HTTP **é mock, não LLM**.

## Status

Parcial.
