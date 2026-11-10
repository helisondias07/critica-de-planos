# REVIEW-RESPONSE v3

- SHA anterior (preservado): `803eeb4fe0f3a7f35245118995d0cbab47ef48e2`
- Revisão independente: cloud `bc-6bfc96e4-4a62-5b49-a210-29d9b54f1b31`
- SHA desta passagem: `8b7748f30f53083de4c6fc0df7b0739d7c29a291`

Confirmei cada citação no código **antes** de alterar. Sem rewrite/force push. Pacotes v1/v2 preservados.

Status continua **parcial**. Loopback = mock, não LLM. Sem credenciais, sem endpoint externo, sem PR.

| Item | Confirmado no SHA 803eeb4? | Acção | Arquivos | Teste | Resultado |
|------|----------------------------|--------|----------|-------|-----------|
| P1.1 Schema HTTP inválido → `unavailable` + retry | Sim (`http-chat.ts` throw `INVALID_OUTPUT`; `pipeline.ts` catch reintentava) | `INVALID_OUTPUT` devolve `invalid` imediatamente, `callsUsed=1`, `retriesUsed=0` | `src/pipeline.ts`, `src/http-chat.ts` | `tests/review-regressions.test.ts` «P1.1»; `tests/http-chat.test.ts` malformado | pass |
| P1.2 401 retry; 429 cego | Sim (429/5xx/`!ok` → `PROVIDER_UNAVAILABLE` retryable) | 401/403 `retryable:false`; 429 só com `Retry-After` parseado (RFC 9110); se espera > orçamento, falha rápido `unavailable` | `src/http-chat.ts`, `src/retry-after.ts`, `src/pipeline.ts` | P1.2 401 / 429-then-ok / 429-long | pass |
| P1.3 MCP `isError` só em `input_error` | Sim (`mcp-server.ts` `isError: result.status === "input_error"`) | `isError` se `status !== "ok"`; texto com `status`/`code` | `src/mcp-server.ts` | P1.3; `tests/mcp-stdio.test.ts` | pass |
| P2.4 UI «Trecho observado» em `inferred-absence` | Sim (`web/app.js` label fixo) | Rótulo «Ausência inferida (contexto observado; não prova o que falta)» | `web/app.js` | `tests/keyboard-ui.test.ts`; screenshots v3 | pass |
| P2.5 `transport=configured-http` em NOT_CONFIGURED | Sim (`createHttpChatProvider` sempre `configured-http`) | `not-configured` se enable/endpoint/model incompletos; stamp via `/api/health` | `src/http-chat.ts`, `src/server.ts`, `web/index.html`, `web/app.js` | `tests/http-chat.test.ts` NOT_CONFIGURED; `tests/cli-http.test.ts` health | pass |
| P2.6 `--provider replay` 0 achados | Sim (`resolveProvider("replay")` sem input → `{findings:[]}`) | Exige `--replay-file` ou `CRITICA_REPLAY_PATH`; CLI exit 1 se faltar | `src/providers.ts`, `src/cli.ts`, `fixtures/replay-sample.json` | P2.6 | pass |
| P2.7 `cwd` no exemplo Cursor | Parcial: exemplo sem caminho absoluto | **Discordância justificada:** [cursor.com/docs/mcp](https://cursor.com/docs/mcp) (2026-11-10) tabela STDIO: `type`, `command`, `args`, `env`, `envFile` — **sem `cwd`**. Interpolação `${workspaceFolder}` em `args` **está** documentada. `cwd` aparece no Cursor Agent SDK, outro contrato. Aviso de auto-invocação MCP (incl. Plan Mode) documentado; **não** é gate Plan→Build. | `docs/examples/cursor-mcp.json.example`, `docs/INTEGRATION-PLAN.md` | revisão documental | aceite com evidência |
| P2.8 citação substring ≥8 | Sim (`source.ts` `b.length >= 8 && a.includes(b)`) | NFKC, ≥16 chars, ≥3 palavras, tokens consecutivos, rejeição trivial. Sem alegar semântica. Fixtures intocadas. | `src/source.ts`, `src/validate.ts` | `tests/source.test.ts`; heurística ainda 7 achados | pass |
| P2.9 JSON inválido stdio silencioso; corrida | Sim (`mcp-stdio.ts` `void async` por linha; catch só logava) | `-32700` JSON-RPC (`id: null`); fila sequencial | `src/mcp-stdio.ts`, `src/mcp-server.ts` | P2.9 parse + fila | pass |
| P2.10 versão package vs MCP | Sim (`package.json` 0.1.0 vs initialize `0.2.0`) | Fonte única `src/version.ts` = `package.json` **0.3.0** | `src/version.ts`, `src/mcp-server.ts`, `package.json` | P2.10 | pass |
| P2.11 `Number(env)\|\|800` ignora 0 | Sim (`http-chat.ts:43-44`) | `parsePositiveIntEnv`: vazio→default; 0/neg/NaN/não-inteiro → `NOT_CONFIGURED` | `src/config-number.ts`, `src/http-chat.ts` | P2.11 | pass |
| P2.12 Ollama fora de `npm test` | Sim (só OpenAI loopback) | Modo `ollama-ok` POST `/api/chat` com `format` + `message.content` | `tests/loopback-openai.ts`, `tests/review-regressions.test.ts` | P2.12 | pass |

## Não resolvido (bloqueios, não recusas desta lista)

- E2E com LLM **real** e host **real** (Cursor/Claude Code) — aguarda escolha do utilizador.
- Campo `cwd` em `mcp.json` — **não adicionado** (ver P2.7).
- Acurácia da heurística / 0 achados GOOD/FIXED — explicitamente **não** é métrica.

## Contagens

`npm ci` + `npm run typecheck` + `npm run build` + `npm test`: **62 pass / 0 fail** (era 45 no SHA 803eeb4). Fixture ruim: **7 achados**.
