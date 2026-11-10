# REVIEW-RESPONSE

Resposta à revisão independente do MVP (P1/P2 na v3; P3 nesta passagem). **Não grava SHAs** — o histórico git é a fonte; um hash neste ficheiro ficaria defasado no commit seguinte.

Status continua **parcial**. Loopback = mock, não LLM. Sem credenciais, sem endpoint externo, sem PR.

| Item | Confirmado na revisão? | Acção | Arquivos | Teste |
|------|------------------------|--------|----------|-------|
| P1.1 Schema HTTP inválido → `unavailable` + retry | Sim | `INVALID_OUTPUT` → `invalid` sem retry | `src/pipeline.ts`, `src/http-chat.ts` | `tests/review-regressions.test.ts` P1.1 |
| P1.2 401 retry; 429 cego | Sim | 401 sem retry; 429 só com `Retry-After` no orçamento | `src/http-chat.ts`, `src/retry-after.ts`, `src/pipeline.ts` | P1.2 |
| P1.3 MCP `isError` | Sim | `isError` se `status !== "ok"` | `src/mcp-server.ts` | P1.3; `tests/mcp-stdio.test.ts` |
| P2.4 UI «Trecho observado» em ausência | Sim | Rótulo «Ausência inferida…» | `web/app.js` | `tests/keyboard-ui.test.ts` |
| P2.5 `transport` em NOT_CONFIGURED | Sim | `not-configured`; stamp via `/api/health` | `src/http-chat.ts`, `src/server.ts`, `web/` | health + http-chat |
| P2.6 replay vazio | Sim | Gravação obrigatória | `src/providers.ts`, `src/cli.ts` | P2.6 |
| P2.7 `cwd` no exemplo Cursor | Parcial | Tabela oficial STDIO **sem `cwd`**; `args` com `${workspaceFolder}` | `docs/examples/cursor-mcp.json.example` | docs |
| P2.8 citação ≥8 | Sim | Tokens, 16 chars, 3 palavras | `src/source.ts` | `tests/source.test.ts` |
| P2.9 stdio parse / corrida | Sim | `-32700`; fila | `src/mcp-stdio.ts` | P2.9 |
| P2.10 versão MCP | Sim | `src/version.ts` = `package.json` | `src/version.ts` | P2.10 |
| P2.11 `Number(env)\|\|800` | Sim | parse positivo; CLI JSON exit 3 se `MAX_TOKENS=0` | `src/config-number.ts`, `src/cli.ts` | P2.11; CLI env 0 |
| P2.12 Ollama | Sim | loopback `/api/chat` | `tests/loopback-openai.ts` | P2.12 |
| P3.1 link CASE | Sim | `docs/REVIEW-RESPONSE.md` | `docs/CASE.md` | revisão |
| P3.2 SHA em docs | Sim | SHAs removidos dos docs do repo | vários `.md` | revisão |
| P3.3 CLI `MAX_TOKENS=0` | Sim | JSON contrato + exit 3 | `src/cli.ts` | `tests/cli-http.test.ts` |
| P3.4 puppeteer-core | — | `^25.17.0` (confirmado no registry) | `package.json` | UI Chrome |
| P3.5 npm audit | — | meta: 0 vulnerabilidades | lockfile | `npm audit` |

## Não resolvido

- E2E com LLM **real** e host **real**.
- Campo `cwd` em `mcp.json` (não inventado).
- 0 achados GOOD/FIXED **não** é acurácia.
