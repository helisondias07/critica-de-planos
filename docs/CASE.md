# CASE — Crítica de planos

## Problema

Planos misturam passo útil com pressuposto, lacuna e risco. Uma “segunda opinião” que aprove ou execute o plano é perigosa. O recorte é protocolo JSON + CLI + bancada local, sem hook do Cursor e sem modelo real.

Inspiração de problema: [jrlucas1/claude-critique-hook](https://github.com/jrlucas1/claude-critique-hook) (João Raul). `license: null`; **nenhum trecho reutilizado.**

## Solução neste MVP

1. Contrato tipado com origem explícita do trecho (`sourceKind` / `sourceId` / `proofKind`).
2. `runCritique` com limites, retries, timeout, abort.
3. Crítico heurístico determinístico (e-commerce frontend sintético).
4. Provedores fake e `llm-pending` (falha local).
5. Sanitização: o `citedEvidence` tem de ser substring da **origem declarada** (passo, restrição, evidência, objetivo ou contexto) — não de um excerpt arbitrário.
6. CLI: JSON no stdout, resumo no stderr.
7. Bancada web local.

`proofKind=observed-excerpt`: o trecho contém o comportamento afirmado.  
`proofKind=inferred-absence`: o trecho é só o contexto observado; a omissão é hipótese.  
**Validação estrutural não prova relevância semântica de modelo.**

## Decisões

- Não “corrigir” as fixtures para o catálogo `e1` falar de cartão: o catálogo continua irrelevante, e os achados passaram a citar o passo/restrição certos.
- TypeScript/Node; runtime só da biblioteca padrão. `puppeteer-core` é **devDependency** para testes de teclado no Chrome do sistema, não para o crítico.
- UI sem CDN. Origin draft como fonte. Sem deploy.

## Falhas encontradas

1. Achados BAD citavam `e1` (catálogo) porque `pickEvidence(/cartão/)` casava com “Não descreve … cartão”. Substring em evidência genérica não é prova. Corrigido: âncora obrigatória na origem relevante; sem fallback para `evidence[0]`.
2. Relatório de UI só provava marcação HTML. Corrigido: Chrome real com Tab, setas, Alt+R, Enter em erro, overflow 390px e contraste simples do stamp.
3. Heurística de auth escolhia `s2` (menciona “próximo pagamento”). Apertada para o passo de processar/capturar (`s3`).
4. Banner de erro sticky cobria JSON; passou a bloco estático.
5. `page.evaluate` com função interna quebrou no tsx (`__name is not defined`); o teste de contraste passou a string.

## FIXED neste recorte

`fixtures/ecommerce-fixed.json` produz **zero achados** na heurística atual. Isso **não** é métrica de precisão nem ausência de falso positivo noutros vocabulários.

## Limitações

- Heurística frágil fora das fixtures.
- Sem axe-core nem leitor de tela.
- Mobile é emulação 390×844, não aparelho físico.
- Integração com modelo real pendente. Sem hook/Plan Mode.

## Status

**MVP local com integração de modelo real pendente.**
