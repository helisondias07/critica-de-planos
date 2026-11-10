# Crítica de planos

**MVP honesto.** Sem E2E com modelo (LLM) real. Sem E2E com host real (Cursor ou Claude Code). A heurística determinística **não é IA**. A ferramenta MCP `critique_plan` é uma ponte **manual** (o host chama a ferramenta); **não** é gancho automático de planos nem gate Plan→Build.

Experimento **local** em TypeScript/Node: protocolo JSON independente de host + CLI + bancada web na mesma máquina. Sem deploy nesta etapa.

Inspiração (só o problema de “segunda opinião sobre um plano”), **sem reutilizar código**: [jrlucas1/claude-critique-hook](https://github.com/jrlucas1/claude-critique-hook) de João Raul. Consulta pública: `license: null`, sem LICENSE identificado — implementação própria.

## O que é (e o que não é)

Segunda etapa de revisão de um **plano**. Identifica riscos, pressupostos e lacunas com:

- `id` e `severity`
- `stepId` que existe no plano
- trecho citado na origem declarada (`sourceKind`/`sourceId`, não um catálogo genérico)
- hipótese
- ação **verificável** (não executada)

**Nunca aprova o plano. Nunca executa sugestões.**

O crítico padrão é **heurístico determinístico** (regras sobre o texto). Também há `replay` e `fake` para testes.

- **NÃO é um segundo LLM.**
- **NÃO valida qualidade de IA.**
- **NÃO é hook do Cursor, Plan Mode, nem integração automática Plan→Build.** Esses modos existem na documentação de produto; este recorte não os usa e não afirma compatibilidade.
- **NÃO chama modelo real neste recorte** (`http-chat` existe mas fica `NOT_CONFIGURED` até o utilizador ligar endpoint+model+enable). Loopback de teste **não é LLM**.
- Ponte MCP stdio (`npm run mcp`, ferramenta `critique_plan`) é **ferramenta**. A documentação pública do Cursor (consultada 2026-11-10) diz que o agente **pode auto-invocar** ferramentas MCP quando relevantes, inclusive em Plan Mode, com aprovação por omissão. Isso **não** é um gate Plan→Build nem captura automática de planos. Não inventámos esse gancho.

## Requisitos

- Node.js 20+ (verificado com v22 neste ambiente)
- npm 10+

## Instalar e correr (offline depois do install)

```bash
npm ci
npm run typecheck
npm run lint
npm test
npm run build
npm run build:static
```

`npm run lint` é um script **mínimo e honesto** (`scripts/lint.mjs`): procura padrões de segredo no código e, se `site/app.js` existir, recusa `/api`, `http-chat` e chaves no bundle. **Não é ESLint.**

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
npm run cli -- --input fixtures/ecommerce-bad.json --provider http-chat --retries 0
npm run cli -- --input fixtures/timeout-lab.json --provider replay --replay-file fixtures/replay-sample.json
npm run mcp
npm run cli -- --schema
npm run cli -- --help
```

`http-chat` sem `CRITICA_LLM_ENABLED=true` sai `unavailable` / `NOT_CONFIGURED` (exit **3**) e **não** corre a heurística. `CRITICA_LLM_MAX_TOKENS=0` (ou valor inválido) com `--provider http-chat` também: JSON do contrato com `error.code=NOT_CONFIGURED`, exit 3 — não usa o default 800.

`replay` **exige** `--replay-file` ou `CRITICA_REPLAY_PATH` com um JSON `{ "findings": [...] }`. Sem gravação a CLI sai com código 1 (não devolve 0 achados em silêncio).

MCP: JSON-RPC newline na stdin/stdout. Parse inválido → `-32700`. Exemplo de config de host (não instalado aqui): `docs/examples/cursor-mcp.json.example` usa `node` + `${workspaceFolder}/dist/mcp-stdio.js` (interpolação documentada em [Cursor MCP](https://cursor.com/docs/mcp)). A tabela oficial STDIO **não lista `cwd`**; não foi inventado esse campo. `docs/examples/claude-code.mcp.json.example` para Claude Code. Plano em `docs/INTEGRATION-PLAN.md`. `critique_plan` devolve `isError: true` em `NOT_CONFIGURED` / `unavailable` / `invalid` / `input_error`.

Bancada web local com backend (sem CDN, sem rede de modelo):

```bash
npm run demo
# http://127.0.0.1:43147
```

## Demo estática (navegador, para a Vercel como site estático)

A análise heurística corre **no browser**. Só planos de exemplo sintéticos. Sem `http-chat`, sem credenciais, sem `/api`.

```bash
npm run build:static
# pasta de saída: site/
# pré-visualização local (servidor de ficheiros, sem backend):
npm run demo:static
# http://127.0.0.1:43151
```

Configuração **sugerida** na Vercel (não criada nem implantada neste recorte):

| Campo | Valor |
|-------|--------|
| Framework Preset | Other (`null` em `vercel.json`) |
| Build Command | `npm run build:static` |
| Output Directory | `site` |

O ficheiro `vercel.json` no repo declara esses três campos. **Não há projeto Vercel nem deploy aqui.**

O aviso no topo da demo: «Demo estática: análise heurística local no seu navegador, sem modelo de IA hospedado, nenhum dado enviado». Timeouts e erros do painel Falhas são **simulações locais**, rotuladas como tal.

## Exit codes do CLI

| Código | `status` | Significado |
|--------|----------|-------------|
| 0 | `ok` | Crítico respondeu; achados podem ser 0. **Não é aprovação.** |
| 1 | — | Flag/provedor desconhecido (falha da CLI, não do plano) |
| 2 | `input_error` | Entrada inválida ou JSON ilegível (**distinguível**) |
| 3 | `unavailable` | Timeout, abort, limite de chamadas, provedor fora, **ou** http-chat mal configurado (`NOT_CONFIGURED`, incl. `CRITICA_LLM_MAX_TOKENS=0`) |
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
      "sourceKind": "step | constraint | evidence | context | objective",
      "sourceId": "s2 | c2 | e1 | objective | context",
      "proofKind": "observed-excerpt | inferred-absence",
      "title": "…",
      "hypothesis": "…",
      "citedEvidence": "trecho que ocorre NA ORIGEM declarada (passo, restrição, evidência, objetivo ou contexto)",
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

A saída **não é instrução confiável**. Campos extra do provedor são ignorados. Achado com `stepId` inexistente, `sourceId` inválido, ou `citedEvidence` que **não é substring da origem declarada** é descartado.

Ser substring de *algum* campo do plano não basta: a origem (`sourceKind`/`sourceId`) tem de ser o texto que sustenta o risco. A citação passa por NFKC, tokens consecutivos (fronteira de palavra), mínimo 16 caracteres e 3 palavras; trechos triviais são rejeitados. **Isto não é relevância semântica.** `proofKind=observed-excerpt` marca trecho observado; `inferred-absence` é ausência inferida (o trecho é só contexto). A UI **não** rotula ausência inferida como “Trecho observado”.

## Limites: defaults vs overrides de demo

Defaults do núcleo (`src/defaults.ts`), usados por CLI/HTTP quando o chamador não passa limites:

| Chave | Default | CLI |
|-------|---------|-----|
| maxCalls | 3 | `--max-calls` |
| maxRetries | 1 | `--retries` |
| totalTimeoutMs | 8000 | `--timeout-ms` |
| attemptTimeoutMs | 2500 | `--attempt-timeout-ms` |
| abort | — | `--abort-after-ms` |
| maxInputBytes | 65536 | (código) |
| maxFindings | 20 | (código) |

Overrides **só** no laboratório da UI e em demos de timeout (não mudam o default): `attemptTimeoutMs=80`, `totalTimeoutMs=200`, `maxRetries=0`, e `maxCalls=0` no botão “Limite de chamadas”.

Interface de provedor: `CritiqueProvider` em `src/contract.ts`. Implementações: heurística, fake (timeout/error/invalid/invented), replay (gravação obrigatória), `llm-pending` (sempre unavailable; **sem integração real ativa**), `http-chat` (desligado por omissão; `transport=not-configured` até enable+endpoint+model). JSON HTTP malformado → `invalid` **sem retry**. 401 nunca reintenta. 429 só com `Retry-After` que caiba no orçamento.

## Fixtures

Domínio sintético: frontend de e-commerce “Loja Norte”. Sem dados reais.

| Arquivo | Papel |
|---------|--------|
| `fixtures/ecommerce-bad.json` | Plano ruim — heurística actual: **7 achados** (F01–F07). Contagem dinâmica, não métrica. |
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
