# INTEGRATION-PLAN — Crítica de planos

Consultado em **2026-11-10** (docs públicas oficiais). Este plano **não afirma** E2E com LLM real nem host Cursor/Claude Code aprovado nesta sessão.

## Escolha mínima (vinculante para o código actual)

| Peça | Escolha | Porquê |
|------|---------|--------|
| Transporte de modelo | **OpenAI-compatible Chat Completions** `POST {endpoint}/chat/completions` com `response_format.json_schema` | Documentado em [Chat Completions](https://developers.openai.com/api/reference/resources/chat) e [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat). Ollama local expõe o mesmo em `http://localhost:11434/v1` ([intro API Ollama](https://docs.ollama.com/api/introduction)). Um adaptador cobre os dois. |
| Dialecto opcional | Ollama nativo `POST /api/chat` + `format` JSON Schema | [docs.ollama.com/api/chat](https://docs.ollama.com/api/chat). |
| Ponte de host | **MCP stdio**, ferramenta `critique_plan` | [MCP transports 2025-11-25](https://modelcontextprotocol.org/specification/2025-11-25/basic/transports), [lifecycle](https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle), [tools](https://modelcontextprotocol.io/specification/2025-11-25/server/tools). Hosts: [Cursor mcp.json](https://cursor.com/docs/mcp), [Claude Code MCP](https://code.claude.com/docs/en/mcp). |
| Default | Heurística; **http-chat desligado** | Sem fallback silencioso. |

**Não encontrado** nas docs oficiais consultadas: um gancho automático Plan→Build do Cursor que invoque este crítico. A chamada MCP é **manual** (`tools/call`). Não inventar esse gancho.

## O que o utilizador tem de escolher para um E2E REAL futuro

1. **Provedor:** `openai-chat-completions` (recomendado) ou `ollama-chat`.
2. **Ambiente:** local Ollama (`http://127.0.0.1:11434/v1`) **ou** remoto compatível (OpenAI ou proxy).
3. **Modelo:** nome exacto no servidor (ex. um modelo já puxado no Ollama). Este repo **não descarrega pesos**.
4. **Teto de custo/orçamento:** `CRITICA_LLM_MAX_TOKENS` (default 800), `maxCalls=1` recomendado, `CRITICA_LLM_TIMEOUT_MS` (default 8000). Sem compra de API neste projecto.
5. **Credencial:** só se o endpoint exigir. Nome da env em `CRITICA_LLM_API_KEY_ENV` (ex. `OPENAI_API_KEY`). O código lê o valor em runtime; **não grava, não pede, não loga**.
6. **Enable explícito:** `CRITICA_LLM_ENABLED=true` **e** `CRITICA_LLM_ENDPOINT` **e** `CRITICA_LLM_MODEL`. Sem isto: `NOT_CONFIGURED`.
7. **Host MCP (opcional, manual):** copiar `docs/examples/cursor-mcp.json.example` para `.cursor/mcp.json` **no ambiente do utilizador** (não feito nesta sessão) **ou** `claude mcp add` / `.mcp.json` no Claude Code. Depois **invocar a ferramenta** `critique_plan`. Isto não captura planos automaticamente.

## Protocolo E2E futuro com LLM (ainda bloqueado)

1. Utilizador sobe Ollama (ou endpoint pago) e escolhe modelo.
2. Exporta as três variáveis `CRITICA_LLM_*` + enable.
3. `npm run cli -- --input fixtures/ecommerce-bad.json --provider http-chat --retries 0`.
4. Esperado: `criticKind=http-chat`, `transport=configured-http`, findings sanitizados; **zero fallback** para heurística se o HTTP falhar (`unavailable`).
5. Comparar qualitativamente com os 7 achados heurísticos da mesma fixture — **sem métrica de acurácia**.
6. MCP: host chama `critique_plan` com `provider: "http-chat"`.

## Falhas a observar no E2E real

429, 5xx, timeout, schema inválido, evidência inventada (já cobertas em **loopback mock**). Recusa do modelo. Estouro de `max_tokens`. Custo acima do teto.

## Bloqueio concreto desta sessão (2026-11-10)

- `CRITICA_LLM_ENABLED` não está `true`.
- Nenhum endpoint real foi contactado.
- Nenhum peso/modelo foi descarregado.
- Nenhum plugin MCP foi instalado na conta do utilizador.
- Testes HTTP usam **127.0.0.1 loopback** — **mock, não LLM**.
- Subprocesso MCP testado com `fake`/`heuristic`, não com modelo.
- **Status: parcial até E2E com modelo real e host real aprovado pelo utilizador.**

## Fontes (data de consulta: 2026-11-10)

- https://developers.openai.com/api/reference/resources/chat
- https://developers.openai.com/api/docs/guides/structured-outputs?api-mode=chat
- https://docs.ollama.com/api/chat
- https://docs.ollama.com/api/introduction
- https://modelcontextprotocol.org/specification/2025-11-25/basic/transports
- https://modelcontextprotocol.io/specification/2025-06-18/basic/lifecycle
- https://modelcontextprotocol.io/specification/2025-11-25/server/tools
- https://cursor.com/docs/mcp
- https://code.claude.com/docs/en/mcp
