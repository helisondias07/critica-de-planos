# CASE — Crítica de planos

## Problema

Planos misturam passo útil com pressuposto e risco. Recorte: JSON + CLI + bancada, depois HTTP configurável e MCP stdio **manual**. Sem hook Plan→Build (não documentado como integração automática nas fontes oficiais consultadas em 2026-11-10).

Inspiração de problema: [jrlucas1/claude-critique-hook](https://github.com/jrlucas1/claude-critique-hook). Licença não identificada; código próprio.

## Solução actual

1. Contrato com `sourceKind` / `sourceId` / `proofKind`.
2. Heurística determinística (e-commerce sintético). Fixture ruim → **7 achados** neste recorte (dinâmico).
3. `http-chat`: Chat Completions OpenAI-compatible + dialecto Ollama. **Desligado por omissão.** Sem fallback para heurística.
4. MCP stdio JSON-RPC, ferramenta `critique_plan`.
5. CLI + GUI inalterados no papel: não executam o plano.

## Histórico de correcções (preservado)

- Auth no blob da evidência; cartão no passo de teste; `tsc` com `.ts` imports.
- Achados BAD citavam `e1` catálogo (“não descreve cartão”). Âncora passou a passo/restrição.
- Relatório UI só tinha marcação; passou a Chrome Tab/atalhos.
- Banner sticky cobria JSON.
- **v2:** provider HTTP + MCP; loopback mock ≠ LLM; BAD alinhado a 7.

## Decisões v2

- Um adaptador Chat Completions cobre OpenAI e Ollama `/v1` (docs oficiais).
- MCP implementado em JSON-RPC próprio (spec), sem instalar plugin na conta do utilizador.
- Credencial só via nome de env; testes usam `Bearer test-token-not-a-secret`.
- Fixtures **não** maquilhadas para mudar a contagem.

## FIXED / GOOD

Zero achados neste recorte heurístico. **Não é acurácia.**

## Limitações / bloqueio

E2E com modelo real e host real **não feito**. Ver `docs/INTEGRATION-PLAN.md`.

**Status: parcial até E2E com modelo real e host real aprovado.**
