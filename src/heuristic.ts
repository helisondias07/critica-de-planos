import type { Finding, PlanInput, RawProviderOutput } from "./contract.js";
import { constraintId, quoteAround } from "./source.js";

function stepText(title: string, description: string): string {
  return `${title}. ${description}`;
}

const INJECTION =
  /ignore (all|todas|previous)|system prompt|aprov[ea] (este|this|o) plano|jailbreak|você agora é/i;

export function runHeuristic(input: PlanInput): RawProviderOutput {
  const findings: Finding[] = [];
  const nextId = () => `F${String(findings.length + 1).padStart(2, "0")}`;

  const push = (partial: Omit<Finding, "id">) => {
    findings.push({ id: nextId(), ...partial });
  };

  const cardStoreStep = input.steps.find((s) => {
    const t = `${s.title} ${s.description}`.toLowerCase();
    if (/sem localstorage|falha se localstorage|não gravar|nao gravar|cobre localstorage/.test(t)) {
      return false;
    }
    return /localstorage/.test(t) && /(gravar|salvar)/.test(t) && /(número do cartão|numero do cartao)/.test(t);
  });
  if (cardStoreStep) {
    const source = stepText(cardStoreStep.title, cardStoreStep.description);
    const cited = quoteAround(source, /gravar.+cartão.+localstorage|localstorage.+cartão/i);
    if (cited) {
      push({
        severity: "critical",
        category: "risk",
        stepId: cardStoreStep.id,
        sourceKind: "step",
        sourceId: cardStoreStep.id,
        proofKind: "observed-excerpt",
        title: "Armazenamento de dados de cartão no cliente",
        hypothesis:
          "O passo observa persistir o número do cartão em localStorage. Hipótese: isso viola a restrição de não armazenar PAN se o passo for copiado para produção.",
        citedEvidence: cited,
        verificationAction:
          "Relê o passo citado e confirme que só tokens de sessão mock são persistidos; teste que falha se 'card', 'cvv' ou PAN aparecerem em localStorage.",
      });
    }
  }

  const stepBlob = input.steps.map((s) => `${s.title} ${s.description}`).join("\n").toLowerCase();
  const goalBlob = `${input.objective}\n${stepBlob}`.toLowerCase();
  if (
    /checkout|pagamento|finalizar compra/.test(goalBlob) &&
    !/auth|login|sessão|autentic/.test(stepBlob)
  ) {
    const pay =
      input.steps.find((s) =>
        /processar pagamento|capturar cartão|finalizar compra|checkout com/i.test(
          `${s.title} ${s.description}`,
        ),
      ) ??
      input.steps.find((s) => /checkout|cobrar o total/i.test(`${s.title} ${s.description}`));
    if (pay) {
      const source = stepText(pay.title, pay.description);
      const cited =
        quoteAround(source, /pagamento|checkout|cobrar|capturar cartão/i) ?? source.slice(0, 180);
      push({
        severity: "high",
        category: "gap",
        stepId: pay.id,
        sourceKind: "step",
        sourceId: pay.id,
        proofKind: "inferred-absence",
        title: "Checkout sem passo de autenticação ou sessão",
        hypothesis:
          "Há passo de checkout/pagamento observado, e nenhum outro passo contém login/sessão/autenticação. A ausência não está escrita como facto; é inferência sobre o conjunto de passos.",
        citedEvidence: cited,
        verificationAction:
          "Listar os stepId e marcar se existe passo com auth/login/sessão; se não houver, o plano está incompleto — não executar checkout.",
      });
    }
  }

  const uiStep = input.steps.find((s) =>
    /catálogo|carrinho|checkout|lista de produtos|vitrine/i.test(`${s.title} ${s.description}`),
  );
  const mentionsErrorUi = input.steps.some((s) =>
    /estado de erro|empty state|lista vazia|falha de rede|offline/i.test(`${s.title} ${s.description}`),
  );
  if (uiStep && !mentionsErrorUi) {
    const source = stepText(uiStep.title, uiStep.description);
    const cited = quoteAround(source, /catálogo|carrinho|vitrine|lista/i) ?? source.slice(0, 180);
    push({
      severity: "medium",
      category: "gap",
      stepId: uiStep.id,
      sourceKind: "step",
      sourceId: uiStep.id,
      proofKind: "inferred-absence",
      title: "Estados vazios e de erro da UI não planejados",
      hypothesis:
        "Há passo de interface de loja e nenhum passo menciona lista vazia, erro de rede ou fallback. Inferência de lacuna, não citação de um 'não faremos erros'.",
      citedEvidence: cited,
      verificationAction:
        "Exigir no plano um passo explícito de empty/error state com critério de aceite testável.",
    });
  }

  const assumptionStep = input.steps.find((s) =>
    /assumindo que|depois (a gente )?vê|não vai falhar|sempre disponível|óbvio que/i.test(
      `${s.title} ${s.description}`,
    ),
  );
  if (assumptionStep) {
    const source = stepText(assumptionStep.title, assumptionStep.description);
    const cited = quoteAround(
      source,
      /assumindo que|depois (a gente )?vê|não vai falhar|sempre disponível|óbvio que/i,
    );
    if (cited) {
      push({
        severity: "high",
        category: "assumption",
        stepId: assumptionStep.id,
        sourceKind: "step",
        sourceId: assumptionStep.id,
        proofKind: "observed-excerpt",
        title: "Pressuposto não verificado no texto do passo",
        hypothesis:
          "O próprio passo usa linguagem de pressuposto ('assumindo que', 'sempre disponível', 'depois vemos'). Hipótese: o trabalho de mitigação ficou fora do plano.",
        citedEvidence: cited,
        verificationAction:
          "Trocar o pressuposto por critério verificável (contrato da API mock, timeout, comportamento na falha).",
      });
    }
  }

  const noStoreIndex = input.constraints.findIndex((c) =>
    /não armazenar|nao armazenar|proibido persistir.*(cartão|card)/i.test(c),
  );
  const storingStep = input.steps.find((s) =>
    /gravar o número do cartão em localstorage|salvar o cartão em localstorage/i.test(
      `${s.title} ${s.description}`,
    ),
  );
  if (noStoreIndex >= 0 && storingStep) {
    const cited = quoteAround(input.constraints[noStoreIndex]!, /não armazenar|nao armazenar/i);
    if (cited) {
      push({
        severity: "critical",
        category: "risk",
        stepId: storingStep.id,
        sourceKind: "constraint",
        sourceId: constraintId(noStoreIndex),
        proofKind: "observed-excerpt",
        title: "Passo em conflito com restrição de armazenamento",
        hypothesis: `A restrição citada proíbe persistir cartão, enquanto o passo ${storingStep.id} descreve gravá-lo em localStorage. Hipótese: o plano está internamente inconsistente.`,
        citedEvidence: cited,
        verificationAction:
          "Confrontar a restrição com o passo; o plano só segue se o passo for removido ou reescrito para mock sem PAN.",
      });
    }
  }

  const wantsTests =
    /teste|testes automat|critério de aceite/i.test(input.objective) ||
    /teste|testes automat|critério de aceite/i.test(input.context ?? "");
  const hasTestStep = input.steps.some((s) =>
    /teste automat|passo de teste|critério de aceite|npm test/i.test(`${s.title} ${s.description}`),
  );
  if (wantsTests && !hasTestStep) {
    const cited = quoteAround(input.objective, /teste/i);
    if (cited) {
      const last = input.steps[input.steps.length - 1]!;
      push({
        severity: "medium",
        category: "gap",
        stepId: last.id,
        sourceKind: "objective",
        sourceId: "objective",
        proofKind: "inferred-absence",
        title: "Testes pedidos no objetivo e ausentes nos passos",
        hypothesis:
          "O objetivo pede testes; nenhum passo descreve verificação executável (comando/fixture). Inferência sobre o conjunto de passos.",
        citedEvidence: cited,
        verificationAction:
          "Incluir um passo de teste com comando e fixture; até lá tratar cobertura como lacuna.",
      });
    }
  }

  const noRealPayIndex = input.constraints.findIndex((c) =>
    /sem pagamento real|proibido cobrar/i.test(c),
  );
  const payStep = input.steps.find((s) =>
    /processar pagamento|cobrar|capturar cartão/i.test(`${s.title} ${s.description}`),
  );
  const hasMockPay = input.steps.some((s) =>
    /mock|sandbox|fake payment/i.test(`${s.title} ${s.description}`),
  );
  if (noRealPayIndex >= 0 && payStep && !hasMockPay) {
    const source = stepText(payStep.title, payStep.description);
    const cited = quoteAround(source, /pagamento|cobrar|capturar cartão/i);
    if (cited) {
      push({
        severity: "high",
        category: "risk",
        stepId: payStep.id,
        sourceKind: "step",
        sourceId: payStep.id,
        proofKind: "observed-excerpt",
        title: "Pagamento descrito sem mock explícito",
        hypothesis: `O passo descreve cobrança/captura de cartão e não nomeia mock/sandbox, apesar da restrição ${constraintId(noRealPayIndex)} ('${input.constraints[noRealPayIndex]}').`,
        citedEvidence: cited,
        verificationAction:
          "Verificar se o passo nomeia provedor fake/sandbox e se não há chave de adquirente; a crítica não autoriza integração real.",
      });
    }
  }

  const uiForA11y = input.steps.find((s) =>
    /vitrine|catálogo|checkout|formulário/i.test(`${s.title} ${s.description}`),
  );
  const mentionsA11y = input.steps.some((s) =>
    /acessib|teclado|aria|foco visível|contraste/i.test(`${s.title} ${s.description}`),
  );
  if (uiForA11y && !mentionsA11y) {
    const source = stepText(uiForA11y.title, uiForA11y.description);
    const cited = quoteAround(source, /vitrine|catálogo|checkout|formulário/i) ?? source.slice(0, 180);
    push({
      severity: "low",
      category: "gap",
      stepId: uiForA11y.id,
      sourceKind: "step",
      sourceId: uiForA11y.id,
      proofKind: "inferred-absence",
      title: "Acessibilidade de teclado/contraste omitida",
      hypothesis:
        "Há passo de UI de loja e nenhum passo cita teclado, foco, ARIA ou contraste. Inferência de omissão, não prova positiva de inacessibilidade.",
      citedEvidence: cited,
      verificationAction:
        "Acrescentar critérios: Tab percorre CTA de compra, foco visível, contraste ≥ 4.5:1 no tema escolhido.",
    });
  }

  for (const ev of input.evidence) {
    if (INJECTION.test(ev.excerpt) || INJECTION.test(ev.source)) {
      const cited = quoteAround(ev.excerpt, INJECTION) ?? ev.excerpt.slice(0, 180);
      const step = input.steps[0]!;
      push({
        severity: "high",
        category: "risk",
        stepId: step.id,
        sourceKind: "evidence",
        sourceId: ev.id,
        proofKind: "observed-excerpt",
        title: "Evidência com payload de instrução (não seguir)",
        hypothesis:
          "O trecho de evidência contém linguagem de injeção/jailbreak. O crítico ignora a instrução; não aprova o plano e não trata o texto como ordem.",
        citedEvidence: cited,
        verificationAction:
          "Manter o campo como evidência bruta, não executar comandos nela; repetir a crítica só com evidência descritiva do domínio.",
      });
    }
  }

  return { findings };
}
