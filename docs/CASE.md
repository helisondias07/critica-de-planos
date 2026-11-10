# CASE — Crítica de planos

## Problema

Planos misturam passo útil com pressuposto e risco. Recorte: JSON + CLI + bancada, HTTP configurável e MCP stdio **como ferramenta**. Sem hook Plan→Build (não documentado como integração automática/gate nas fontes oficiais consultadas em 2026-11-10). O Cursor **pode auto-invocar** MCP tools (docs públicas); isso não é gate de execução.

Inspiração de problema: [jrlucas1/claude-critique-hook](https://github.com/jrlucas1/claude-critique-hook). Licença não identificada; código próprio.

## Solução actual (v0.3.0)

1. Contrato com `sourceKind` / `sourceId` / `proofKind`.
2. Heurística determinística. Fixture ruim → **7 achados** (F01–F07) neste recorte.
3. `http-chat`: Chat Completions + dialecto Ollama `/api/chat`. **Desligado por omissão.** Sem fallback para heurística. `transport=not-configured` até estar realmente configurado.
4. MCP stdio JSON-RPC, ferramenta `critique_plan`, `isError: true` quando o núcleo não está `ok`.
5. CLI + GUI: não executam o plano.

## Histórico de correcções (preservado)

- Auth no blob da evidência; cartão no passo de teste; `tsc` com `.ts` imports.
- Achados BAD citavam `e1` catálogo. Âncora passou a passo/restrição.
- Relatório UI só tinha marcação; passou a Chrome Tab/atalhos.
- Banner sticky cobria JSON.
- **v2:** provider HTTP + MCP; loopback mock ≠ LLM; BAD alinhado a 7. Revisão independente confirmou a suíte da época e **não aprovou** (histórico git; SHAs não são gravados aqui para não ficarem defasados).
- **v3:** P1 (invalid sem retry; 401/429 Retry-After; MCP `isError`) e P2 (rótulo inferred-absence; stamp do servidor; replay honesto; citação endurecida; stdio -32700 + fila; versão única; parse de inteiros; teste Ollama loopback). Fixtures **não** maquilhadas.

## Decisões v3

- Schema HTTP inválido é falha de contrato (`invalid`), não indisponibilidade transitória.
- 429 sem `Retry-After` válido não reintenta (nada de retry cego). `Retry-After` maior que o teto falha rápido.
- Tabela oficial Cursor `mcp.json` STDIO (2026-11-10): `type`, `command`, `args`, `env`, `envFile`. **`cwd` não consta** — o exemplo usa `${workspaceFolder}` em `args`, que **está** documentado.
- Citação: tokens consecutivos, não substring crua de 8 caracteres. Sem alegar semântica.

## FIXED / GOOD

Zero achados neste recorte heurístico. **Não é acurácia.**

## Limitações / bloqueio

E2E com modelo real e host real **não feito**. Ver `docs/INTEGRATION-PLAN.md` e `docs/REVIEW-RESPONSE.md`.

**Status: parcial até E2E com modelo real e host real aprovado.**
