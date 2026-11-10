# CASE — Crítica de planos

## Problema

Planos gerados (por pessoa ou por modelo) misturam passo útil com pressuposto implícito, lacuna e risco. Uma “segunda opinião” que **aprove** ou **execute** o plano é perigosa. O pedido era um recorte testável: protocolo JSON + CLI, sem fingir hook do Cursor e sem modelo real.

A referência pública [jrlucas1/claude-critique-hook](https://github.com/jrlucas1/claude-critique-hook) (João Raul) inspirou o *problema* (“segunda passagem sobre um plano”). Metadata GitHub: `license: null`; LICENSE não encontrado. **Nenhum trecho foi reutilizado.** Este artefato não se apresenta como o projeto de João Raul.

## Solução neste MVP

1. Contrato tipado (`PlanInput` / `CritiqueResult`) + JSON Schema documental + validador próprio.
2. Núcleo `runCritique`: limites, retries, timeout por tentativa e total, `AbortController`.
3. Crítico **heurístico determinístico** sobre e-commerce frontend sintético.
4. Provedores `fake` e `llm-pending` (este último só falha localmente).
5. Sanitização: ignora campos inesperados; descarta evidência inventada e `stepId` inválido.
6. CLI com JSON no stdout e resumo no stderr; exit codes documentados.
7. Bancada web local (layout próprio) para inspecionar exemplos bom/ruim/corrigido e falhas.

Falha segura: erro de provedor → `unavailable` ou `invalid`, `findings: []`. Erro de entrada → `input_error` (exit 2), distinguível.

## Decisões

- TypeScript/Node, dependências só de desenvolvimento (`typescript`, `tsx`, `@types/node`). Runtime: biblioteca padrão.
- Heurística em vez de LLM: cabe no offline e deixa explícito o que o sistema *não* é.
- UI sem framework e sem CDN: um servidor HTTP e HTML/CSS/JS próprios, contraste alto, teclado, viewport estreita.
- Não imitar produto de terceiros; nome visível “Crítica de planos” / “bancada”.
- Origin draft como fonte; sem GitHub mirror, sem deploy, sem copiar para o disco do usuário.

## Falhas encontradas no caminho

- Primeira versão da heurística usava o *blob* inteiro (incluindo evidência “não descreve sessão”) e **não** disparava lacuna de auth. Corrigido: auth só olha passos.
- Plano *corrigido* ainda disparava “cartão em localStorage” porque um passo de **teste** citava `localStorage` e `cvv`. Corrigido: a regra exige *gravar/salvar número do cartão*, e ignora “cobre localStorage”.
- `tsc` recusou imports `.ts` sem `allowImportingTsExtensions`. Imports de `src/` passaram a especifiers `.js` (NodeNext).

## Limitações

- Heurística é frágil fora do vocabulário das fixtures. Não generaliza para planos arbitrários.
- Zero findings no plano “bom” **não** prova ausência de falso positivo em outros domínios.
- Sem axe-core em browser real neste pacote; a11y coberta por marcação/CSS + checagem visual.
- Integração com modelo real **pendente de propósito**.
- Sem afirmação de que Cursor aplicará isto em Plan Mode.

## Aprendizados

- “Segunda etapa” precisa recusar aprovação no contrato, não só no texto de UI.
- Citação de evidência como substring evita achados inventados mais do que um campo livre.
- Distinguir `input_error` de `unavailable` é o que permite ao chamador seguir o trabalho.

## Status

**MVP local com integração de modelo real pendente.**
