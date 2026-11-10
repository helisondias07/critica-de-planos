# Crítica de planos

Experimento **local** em TypeScript/Node: protocolo JSON independente de host + CLI manual + bancada web na mesma máquina.

**Status: MVP local com integração de modelo real pendente.** Não publicado, sem deploy, sem PR.

## O que é (e o que não é)

Segunda etapa de revisão de um **plano**. Identifica riscos, pressupostos e lacunas com:

- `id` e `severity`
- `stepId` que existe no plano
- evidência citada (`evidenceId` + trecho que ocorre no excerpt)
- hipótese
- ação **verificável** (não executada)

**Nunca aprova o plano. Nunca executa sugestões.**

O crítico padrão é **heurístico determinístico** (regras sobre o texto). Também há `replay` e `fake` para testes.

- **NÃO é um segundo LLM.**
- **NÃO valida qualidade de IA.**
- **NÃO é hook do Cursor, Plan Mode, nem integração automática Plan→Build.** Esses modos existem na documentação de produto; este recorte não os usa e não afirma compatibilidade.
- **NÃO chama modelo real**, não usa credencial, não compra API.

Inspiração (apenas o problema de “segunda opinião sobre um plano”), **sem reutilizar código**: [jrlucas1/claude-critique-hook](https://github.com/jrlucas1/claude-critique-hook) de João Raul. Consulta pública: `license: null`, sem arquivo LICENSE identificado. Tratado como **licença não identificada** — implementação própria.

## Requisitos

- Node.js 20+ (verificado com v22 neste ambiente)
- npm 10+

## Instalar e correr (offline depois do install)

```bash
npm ci
npm run typecheck
npm test
npm run build
```

CLI (JSON em **stdout**, resumo legível em **stderr**):

```bash
npm run cli -- --input fixtures/ecommerce-bad.json
npm run cli -- --input fixtures/ecommerce-fixed.json --json-only
npm run cli -- --input fixtures/ecommerce-good.json
npm run cli -- --input fixtures/malformed.json
npm run cli -- --input fixtures/prompt-injection.json
npm run cli -- --input fixtures/timeout-lab.json --provider fake:timeout --attempt-timeout-ms 80 --timeout-ms 200 --retries 0
npm run cli -- --input fixtures/timeout-lab.json --provider fake:error --retries 0
npm run cli -- --input fixtures/timeout-lab.json --provider fake:invalid
npm run cli -- --input fixtures/timeout-lab.json --provider fake:invented
npm run cli -- --input fixtures/timeout-lab.json --max-calls 0
npm run cli -- --schema
npm run cli -- --help
```

Bancada web local (sem CDN, sem rede de modelo):

```bash
npm run demo
# http://127.0.0.1:43147
```

## Exit codes do CLI

| Código | `status` | Significado |
|--------|----------|-------------|
| 0 | `ok` | Crítico respondeu; achados podem ser 0. **Não é aprovação.** |
| 1 | — | Flag/provedor desconhecido (falha da CLI, não do plano) |
| 2 | `input_error` | Entrada inválida ou JSON ilegível (**distinguível**) |
| 3 | `unavailable` | Timeout, abort, limite de chamadas, provedor fora |
| 4 | `invalid` | Saída do crítico não estruturada |

Em `unavailable` e `invalid` a CLI **ainda imprime JSON**, com `findings: []`. Erro de crítico não “derruba” o chamador além do status explícito.

## Contrato de entrada

Campos conhecidos (outros são **ignorados**):

```json
{
  "objective": "string ≥ 8",
  "context": "opcional",
  "constraints": ["…"],
  "steps": [{ "id": "s1", "title": "…", "description": "…" }],
  "evidence": [{ "id": "e1", "source": "…", "excerpt": "…" }]
}
```

- `steps[].id`: `s` + dígitos (`s1`…`s999`)
- `evidence[].id`: `e` + dígitos
- schemas: `schemas/plan-input.schema.json`, `src/schema.ts`
- validação executável: `src/validate.ts` (tamanho, ids, unicidade)

## Contrato de saída

```json
{
  "status": "ok | unavailable | invalid | input_error",
  "criticKind": "heuristic-deterministic | replay | fake | unavailable",
  "disclaimer": "…NÃO é um segundo LLM…",
  "findings": [
    {
      "id": "F01",
      "severity": "critical | high | medium | low",
      "category": "risk | assumption | gap",
      "stepId": "s2",
      "evidenceId": "e1",
      "title": "…",
      "hypothesis": "…",
      "citedEvidence": "trecho que ocorre no excerpt",
      "verificationAction": "passo verificável, não executar automaticamente"
    }
  ],
  "error": { "code": "…", "message": "…" },
  "meta": {
    "providerId": "heuristic-v1",
    "callsUsed": 1,
    "maxCalls": 3,
    "retriesUsed": 0,
    "timedOut": false,
    "aborted": false,
    "droppedFindings": 0,
    "ignoredUnexpectedFields": []
  }
}
```

A saída **não é instrução confiável**. Campos extra do provedor são ignorados. Achado com `stepId` inexistente, evidência inventada ou citação que não está no excerpt é **descartado**.

## Limites (defaults)

Definidos em `src/defaults.ts`:

| Chave | Default | CLI |
|-------|---------|-----|
| maxCalls | 3 | `--max-calls` |
| maxRetries | 1 | `--retries` |
| totalTimeoutMs | 8000 | `--timeout-ms` |
| attemptTimeoutMs | 2500 | `--attempt-timeout-ms` |
| abort | — | `--abort-after-ms` |
| maxInputBytes | 65536 | (código) |
| maxFindings | 20 | (código) |

Interface de provedor: `CritiqueProvider` em `src/contract.ts`. Implementações: heurística, fake (timeout/error/invalid/invented), replay, `llm-pending` (sempre unavailable; **sem integração real ativa**).

## Fixtures

Domínio sintético: frontend de e-commerce “Loja Norte”. Sem dados reais.

| Arquivo | Papel |
|---------|--------|
| `fixtures/ecommerce-bad.json` | Plano ruim |
| `fixtures/ecommerce-fixed.json` | Mesma história, corrigida |
| `fixtures/ecommerce-good.json` | Plano já verificável |
| `fixtures/malformed.json` | Input inválido |
| `fixtures/prompt-injection.json` | Campos extra + jailbreak literal |
| `fixtures/timeout-lab.json` | Veículo para fake/timeout |

O par ruim/corrigido é avaliado **qualitativamente** nos testes: certos títulos somem no corrigido. **Não há métrica de precisão fabricada.**

## Arquitetura

```
entrada JSON ─┬─ validatePlanInput
              ├─ provider.critique (1..maxCalls, timeout, abort)
              ├─ sanitizeProviderOutput (ids, citação, campos extra)
              └─ CritiqueResult (status explícito)
```

CLI e HTTP (`POST /api/critique`) usam o **mesmo** `runCritique`. A UI em `web/` é estática, servida por `src/server.ts` em `127.0.0.1:43147`.

## Não objetivos

- Hook, Plan Mode, Build automático
- Segundo modelo, ranking de qualidade de IA
- Pagamento real, credenciais, deploy
- Publicar repositório ou decidir nome/visibilidade
- Copiar UI ou código da referência

## Licença deste experimento

MIT (arquivo `LICENSE`). Código original deste draft.
