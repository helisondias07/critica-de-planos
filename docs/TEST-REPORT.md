# TEST-REPORT — Crítica de planos

Ambiente:

- Node `v22.23.4`
- npm `10.9.9`
- Comandos: `npx tsc -p tsconfig.json --noEmit`; `npm run build`; `npx tsx --test tests/a11y-markup.test.ts tests/cli-http.test.ts tests/heuristic.test.ts tests/pipeline.test.ts tests/keyboard-ui.test.ts`

Log: `/opt/cursor/artifacts/test-output.txt`

## Defaults do núcleo vs overrides de demo

Defaults (`src/defaults.ts`): `maxCalls=3`, `maxRetries=1`, `totalTimeoutMs=8000`, `attemptTimeoutMs=2500`.  
CLI/HTTP usam estes valores se o chamador não passar limites.

Overrides **apenas** no laboratório da UI (`web/app.js`) e nas demos de timeout da CLI: `attemptTimeoutMs=80`, `totalTimeoutMs=200`, `maxRetries=0`; botão limite usa `maxCalls=0`. Não alteram o default.

## Contagem desta passagem (2026-11-10T00:24:14Z)

```
# tests 32
# suites 9
# pass 32
# fail 0
```

`typecheck_exit=0`, `build_exit=0`, `tests_exit=0`.

Nesta passagem **nada falhou**. Falhas anteriores já corrigidas: citação em `e1` irrelevante; auth no passo `s2`; `page.evaluate`/`__name`; banner sticky.

## Âncora de evidência (regressão)

`tests/heuristic.test.ts`:

- Achado de cartão: `sourceKind=step`, `sourceId=s2`, `proofKind=observed-excerpt`, trecho com `localStorage` e `cartão`, **não** o catálogo `e1`.
- Achado de autenticação: `sourceKind=step`, `sourceId=s3`, `proofKind=inferred-absence` (hipótese de omissão), trecho do passo de pagamento, **não** `e1`.
- `ecommerce-fixed.json`: `findings.length === 0` neste recorte (não é precisão universal).
- `ecommerce-good.json`: idem, zero achados neste recorte.

A sanitização confirma só que o trecho está na origem declarada. **Não** afirma relevância semântica de LLM.

## Teclado real (Chrome)

`tests/keyboard-ui.test.ts` (puppeteer-core + `/usr/bin/google-chrome-stable`):

1. Tab no skip link; seta troca aba Bancada→Exemplos; foco no botão Correr crítica com outline.
2. Alt+2 / Alt+R corre crítica e mostra `origem step:s2`.
3. Alt+4 + Enter em “Input malformado” mostra alerta de `input_error`.
4. Viewport 390px: `scrollWidth <= clientWidth`; contraste medido do `.stamp` ≥ 4.5:1.

Não executámos axe-core nem leitor de tela.

## Par ruim / corrigido

- `fixtures/ecommerce-bad.json`: achados ancorados em passo/restrição/objetivo.
- `fixtures/ecommerce-fixed.json`: **vazio**.
- `fixtures/ecommerce-good.json`: **vazio**.

## Status

MVP local com integração de modelo real pendente.
