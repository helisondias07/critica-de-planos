# INTEGRATION-PLAN — Crítica de planos

Consultado em **2026-11-10** (docs públicas oficiais, reconsulta nesta passagem). Este plano **não afirma** E2E com LLM real nem host Cursor/Claude Code aprovado.

## Escolha mínima (vinculante para o código actual)

| Peça | Escolha | Porquê |
|------|---------|--------|
| Transporte de modelo | **OpenAI-compatible Chat Completions** `POST {endpoint}/chat/completions` com `response_format.json_schema` | [Chat Completions](https://platform.openai.com/docs/api-reference/chat) / [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat). Ollama local expõe `/v1` ([intro API Ollama](https://docs.ollama.com/api/introduction)). |
| Dialecto opcional | Ollama nativo `POST /api/chat` + `format` JSON Schema | [docs.ollama.com/api/chat](https://docs.ollama.com/api/chat) (2026-11-10). Testado só em loopback falso. |
| Ponte de host | **MCP stdio**, ferramenta `critique_plan` | [MCP transports](https://modelcontextprotocol.org/specification/2025-11-25/basic/transports), [tools](https://modelcontextprotocol.org/specification/2025-11-25/server/tools) (isError em falha de ferramenta), JSON-RPC 2.0 [Parse error -32700](https://www.jsonrpc.org/specification). Hosts: [Cursor mcp.json](https://cursor.com/docs/mcp), [Claude Code MCP](https://code.claude.com/docs/en/mcp). |
| HTTP retry | 401 nunca; 429 só com `Retry-After` (RFC 9110) se couber no teto; schema inválido sem retry | Comportamento desta revisão; não é “LLM”. |
| Default | Heurística; **http-chat desligado** | Sem fallback silencioso. `transport=not-configured`. |

**Não encontrado** nas docs oficiais consultadas: um gancho automático Plan→Build que invoque este crítico como *gate de execução*.

**Encontrado** em [cursor.com/docs/mcp](https://cursor.com/docs/mcp) (2026-11-10): «Cursor automatically uses MCP tools listed under Available Tools when relevant. This includes Plan Mode.» + aprovação de ferramenta por omissão. Avisar: o agente **pode auto-invocar** `critique_plan`. Isso **não** captura o plano nem bloqueia Build.

**`cwd`:** a tabela STDIO oficial em cursor.com/docs/mcp lista `type`, `command`, `args`, `env`, `envFile`. **Não lista `cwd`.** O exemplo usa `args: ["${workspaceFolder}/dist/mcp-stdio.js"]` (interpolação documentada nos mesmos docs). O campo `cwd` existe no **Cursor Agent SDK** (outro produto); não foi copiado para `mcp.json` para não inventar suporte.

## O que o utilizador tem de escolher para um E2E REAL futuro

1. **Provedor:** `openai-chat-completions` (recomendado) ou `ollama-chat`.
2. **Ambiente:** local Ollama (`http://127.0.0.1:11434/v1` ou `/api/chat`) **ou** remoto compatível.
3. **Modelo:** nome exacto já presente no servidor. Este repo **não descarrega pesos**.
4. **Teto:** `CRITICA_LLM_MAX_TOKENS` (default 800, inteiro 1..32000), `maxCalls=1` recomendado, `CRITICA_LLM_TIMEOUT_MS` (default 8000, 1..120000). Sem compra de API neste projecto.
5. **Credencial:** só se o endpoint exigir. Nome da env em `CRITICA_LLM_API_KEY_ENV`. O código **não pede, não grava, não loga** o valor.
6. **Enable:** `CRITICA_LLM_ENABLED=true` **e** `CRITICA_LLM_ENDPOINT` **e** `CRITICA_LLM_MODEL`.
7. **Host MCP (opcional):** copiar o exemplo para `.cursor/mcp.json` **no ambiente do utilizador** (não feito aqui) **ou** Claude Code `.mcp.json`. Depois o host pode chamar (ou auto-invocar) `critique_plan`. Continua a não ser Plan→Build.

## Protocolo E2E futuro com LLM (ainda bloqueado)

1. Utilizador sobe Ollama (ou endpoint pago) e escolhe modelo.
2. Exporta as três variáveis `CRITICA_LLM_*` + enable.
3. `npm run cli -- --input fixtures/ecommerce-bad.json --provider http-chat --retries 0`.
4. Esperado: `criticKind=http-chat`, `transport=configured-http`; **zero fallback** se HTTP falhar (`unavailable`/`invalid`).
5. Comparar qualitativamente com os **7** achados heurísticos — **sem métrica de acurácia**.
6. MCP: host chama `critique_plan` com `provider: "http-chat"`. `isError: true` se NOT_CONFIGURED.

## Falhas a observar no E2E real

429 (Retry-After), 401, 5xx, timeout, schema inválido (agora `invalid`, sem retry), evidência inventada (loopback já cobre). Recusa do modelo. Estouro de `max_tokens`.

## Bloqueio concreto desta sessão (2026-11-10)

- `CRITICA_LLM_ENABLED` não está `true`.
- Nenhum endpoint real foi contactado.
- Nenhum peso/modelo foi descarregado.
- Nenhum plugin MCP foi instalado na conta do utilizador.
- Testes HTTP usam **127.0.0.1 loopback** — **mock, não LLM**.
- Subprocesso MCP testado com `fake`/`heuristic`/parse, não com modelo.
- **Status: parcial até E2E com modelo real e host real aprovado pelo utilizador.**

## Fontes (data de consulta: 2026-11-10)

- https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat
- https://docs.ollama.com/api/chat
- https://docs.ollama.com/api/introduction
- https://modelcontextprotocol.org/specification/2025-11-25/basic/transports
- https://modelcontextprotocol.org/specification/2025-11-25/server/tools
- https://www.jsonrpc.org/specification
- https://cursor.com/docs/mcp
- https://code.claude.com/docs/en/mcp
