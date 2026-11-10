# TEST-REPORT — Crítica de planos

Ambiente real desta execução:

- Node `v22.23.4`
- npm `10.9.9`
- Data UTC: `2026-11-10T00:16:14Z`
- Comando: `npx tsc -p tsconfig.json --noEmit` (exit 0)
- Comando: `npm run build` (exit 0)
- Comando: `npx tsx --test tests/*.test.ts`

## Contagem

```
# tests 26
# suites 8
# pass 26
# fail 0
```

Log completo: `/opt/cursor/artifacts/test-output.txt`

Nada falhou nesta passagem. Duas asserções de heurística falharam numa passagem **anterior** (auth olhava evidência; passo de teste citava localStorage) e foram corrigidas antes deste relatório.

## O que os testes cobrem

| Área | Arquivo | Resultado |
|------|---------|-----------|
| Marcação a11y / viewport CSS / sem CDN | `tests/a11y-markup.test.ts` | 3 pass |
| CLI stdout/stderr e exit 2 | `tests/cli-http.test.ts` | 3 pass |
| HTTP health, HTML, POST ruim, POST malformado | `tests/cli-http.test.ts` | 4 pass |
| Par ruim/corrigido, plano bom, injeção | `tests/heuristic.test.ts` | 5 pass |
| Fixtures distintas | `tests/heuristic.test.ts` | 1 pass |
| Input inválido | `tests/pipeline.test.ts` | 2 pass |
| timeout, unavailable, invalid, invented, maxCalls, llm-pending, retries | `tests/pipeline.test.ts` | 7 pass |
| Sanitizador de citação | `tests/pipeline.test.ts` | 1 pass |

## Par ruim / corrigido (sem métrica de precisão)

Execução CLI (`/opt/cursor/artifacts/demo-cli.txt`):

- `ecommerce-bad.json`: status `ok`, exit 0, achados F01–F06 (critical/high presentes: cartão em localStorage, checkout sem sessão, pressuposto, conflito de restrição, pagamento sem mock, a11y).
- `ecommerce-fixed.json`: status `ok`, exit 0; os títulos de armazenamento de cartão e checkout sem sessão **não** reaparecem.
- `ecommerce-good.json`: status `ok`, exit 0, `findings: []` neste recorte. **Não** interpretar como “zero falso positivo universal”.

## Falhas, limites, payload malicioso (CLI real)

| Caso | status | exit |
|------|--------|------|
| malformed | input_error | 2 |
| prompt-injection | ok (achado de injeção; campos extra ignorados) | 0 |
| fake:timeout | unavailable | 3 |
| fake:error | unavailable | 3 |
| fake:invalid | invalid | 4 |
| fake:invented | ok, findings vazios, dropped≥1 | 0 |
| max-calls 0 | unavailable CALL_LIMIT | 3 |
| llm-pending | unavailable | 3 |

O caso invented é **status ok** com achados descartados: o provedor respondeu, a sanitização removeu evidência inventada. Não é aprovação.

## UI (não é produto de outro fornecedor)

Servidor: `npx tsx src/server.ts` em `http://127.0.0.1:43147` (`GET /` 200, `GET /api/health` llm=false hooks=false).

Screenshots **reais** (Chrome headless do sistema, Puppeteer-core temporário, **não** dependência do projeto):

- Desktop 1280×800: `ui-desktop-bancada.png`, `ui-desktop-exemplos-ruim.png`, `ui-desktop-inspecao-ruim.png`, `ui-desktop-inspecao-bom.png`, `ui-desktop-falhas-timeout.png`, `ui-desktop-falhas-invalid.png`
- Mobile emulado 390×844: `ui-mobile-bancada.png`, `ui-mobile-inspecao.png`, `ui-mobile-erro.png`

Limitações honestas de UI:

- Viewport móvel é emulação Chrome, não aparelho físico.
- Não rodamos axe-core/engine de leitor de tela; há testes de marcação (skip link, tablist, live region, foco, reduced motion) e inspeção visual das screenshots.
- Puppeteer-core foi instalado só para capturar e **desinstalado**; o lockfile do experimento permanece com typescript/tsx/@types/node.

## Distinção mock vs modelo

Tudo nesta bateria é heurística, replay ou fake. `llm-pending` falha localmente. **Nenhuma chamada a modelo real.**

## Status

MVP local com integração de modelo real pendente.
