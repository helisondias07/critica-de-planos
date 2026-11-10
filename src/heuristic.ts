import type { Finding, PlanEvidence, PlanInput, RawProviderOutput } from "./contract.js";

function blob(input: PlanInput): string {
  return [
    input.objective,
    input.context ?? "",
    ...input.constraints,
    ...input.steps.map((s) => `${s.title} ${s.description}`),
    ...input.evidence.map((e) => `${e.source} ${e.excerpt}`),
  ]
    .join("\n")
    .toLowerCase();
}

function cite(evidence: PlanEvidence): string {
  const excerpt = evidence.excerpt.replace(/\s+/g, " ").trim();
  return excerpt.length <= 160 ? excerpt : excerpt.slice(0, 157) + "...";
}

function pickEvidence(input: PlanInput, keywords: RegExp): PlanEvidence {
  const found = input.evidence.find((e) =>
    keywords.test(`${e.source} ${e.excerpt}`.toLowerCase()),
  );
  return found ?? input.evidence[0]!;
}

function pickStep(input: PlanInput, keywords: RegExp) {
  return input.steps.find((s) => keywords.test(`${s.title} ${s.description}`.toLowerCase()))
    ?? input.steps[0]!;
}

const INJECTION =
  /ignore (all|todas|previous)|system prompt|aprov[ea] (este|this|o) plano|jailbreak|você agora é/i;

export function runHeuristic(input: PlanInput): RawProviderOutput {
  const all = blob(input);
  const findings: Finding[] = [];
  const nextId = () => `F${String(findings.length + 1).padStart(2, "0")}`;

  const push = (partial: Omit<Finding, "id">) => {
    findings.push({ id: nextId(), ...partial });
  };

  const cardStoreStep = input.steps.find((s) => {
    const t = `${s.title} ${s.description}`.toLowerCase();
    if (/sem localstorage|falha se localstorage|não gravar|nao gravar|cobre localstorage/.test(t)) return false;
    return /localstorage/.test(t) && /(gravar|salvar)/.test(t) && /(número do cartão|numero do cartao)/.test(t);
  });
  if (cardStoreStep) {
    const evidence = pickEvidence(input, /cartão|localstorage|dado sintético|catálogo/i);
    push({
      severity: "critical",
      category: "risk",
      stepId: cardStoreStep.id,
      evidenceId: evidence.id,
      title: "Armazenamento de dados de cartão no cliente",
      hypothesis:
        "O plano descreve persistir dados de cartão em localStorage, o que viola restrições típicas de não armazenar PAN e aumenta risco mesmo em dado sintético se o passo for copiado para produção.",
      citedEvidence: cite(evidence),
      verificationAction:
        "Inspecionar o passo citado e confirmar que apenas tokens de sessão de checkout mock são persistidos; adicionar teste que falha se 'card', 'cvv' ou PAN aparecerem em localStorage.",
    });
  }

  const stepBlob = input.steps.map((s) => `${s.title} ${s.description}`).join("\n").toLowerCase();
  const goalBlob = `${input.objective}\n${stepBlob}`;
  if (
    /checkout|pagamento|finalizar compra/.test(goalBlob) &&
    !/auth|login|sessão|autentic/.test(stepBlob)
  ) {
    const step = pickStep(input, /checkout|pagamento|compra/i);
    const evidence = pickEvidence(input, /checkout|catálogo|sessão/i);
    push({
      severity: "high",
      category: "gap",
      stepId: step.id,
      evidenceId: evidence.id,
      title: "Checkout sem passo de autenticação ou sessão",
      hypothesis:
        "Há checkout/pagamento no plano, mas nenhum passo cobre login, sessão ou identidade do comprador sintético.",
      citedEvidence: cite(evidence),
      verificationAction:
        "Listar os stepId e marcar se existe passo com auth/login/sessão; se não houver, o plano está incompleto — não executar checkout.",
    });
  }

  if (
    /(catálogo|carrinho|checkout|lista de produtos)/.test(all) &&
    !/(estado de erro|empty state|lista vazia|falha de rede|offline)/.test(all)
  ) {
    const step = pickStep(input, /catálogo|carrinho|lista|vitrine/i);
    const evidence = pickEvidence(input, /catálogo|produto|ui|interface/i);
    push({
      severity: "medium",
      category: "gap",
      stepId: step.id,
      evidenceId: evidence.id,
      title: "Estados vazios e de erro da UI não planejados",
      hypothesis:
        "Passos de interface de loja não mencionam lista vazia, erro de rede ou fallback; a revisão não pode assumir que isso será tratado depois.",
      citedEvidence: cite(evidence),
      verificationAction:
        "Exigir no plano um passo explícito de empty/error state com critério de aceite testável (ex.: 'carrinho vazio mostra CTA de catálogo').",
    });
  }

  if (/(assumindo que|depois (a gente )?vê|não vai falhar|sempre disponível|óbvio que)/.test(all)) {
    const step = pickStep(input, /assumindo|depois|não vai falhar|sempre disponível|óbvio/i);
    const evidence = pickEvidence(input, /estoque|api|assum|dispon/i);
    push({
      severity: "high",
      category: "assumption",
      stepId: step.id,
      evidenceId: evidence.id,
      title: "Pressuposto não verificado no texto do passo",
      hypothesis:
        "Linguagem do tipo 'assumindo que', 'sempre disponível' ou 'depois vemos' indica trabalho deslocado para fora do plano, sem evidência de mitigação.",
      citedEvidence: cite(evidence),
      verificationAction:
        "Substituir o pressuposto por um critério verificável (contrato da API mock, timeout, e o que acontece na falha) ou registrar a lacuna como risco aceito — a crítica não aprova o pressuposto.",
    });
  }

  const noStore = input.constraints.some((c) =>
    /não armazenar|nao armazenar|proibido persistir.*(cartão|card)/i.test(c),
  );
  const stores = input.steps.some((s) => {
    const t = `${s.title} ${s.description}`;
    return /gravar o número do cartão em localstorage|salvar o cartão em localstorage/i.test(t);
  });
  if (noStore && stores) {
    const step = pickStep(input, /localstorage|cartão/i);
    const evidence = pickEvidence(input, /não armazenar|dado sintético|restri/i);
    push({
      severity: "critical",
      category: "risk",
      stepId: step.id,
      evidenceId: evidence.id,
      title: "Passo em conflito com restrição de armazenamento",
      hypothesis:
        "Uma restrição do próprio plano proíbe persistir cartão, mas um passo descreve exatamente isso.",
      citedEvidence: cite(evidence),
      verificationAction:
        "Confrontar o texto da restrição com o passo; o plano só segue se o passo for removido ou reescrito para mock sem PAN.",
    });
  }

  const wantsTests = /teste|testes automat|critério de aceite/.test(all);
  const hasTestStep = input.steps.some((s) =>
    /teste|assert|critério de aceite/i.test(`${s.title} ${s.description}`),
  );
  if (wantsTests && !hasTestStep) {
    const step = input.steps[input.steps.length - 1]!;
    const evidence = pickEvidence(input, /teste|objetivo|catálogo/i);
    push({
      severity: "medium",
      category: "gap",
      stepId: step.id,
      evidenceId: evidence.id,
      title: "Testes pedidos no objetivo e ausentes nos passos",
      hypothesis:
        "O objetivo ou o contexto pede testes, mas nenhum stepId descreve verificação executável.",
      citedEvidence: cite(evidence),
      verificationAction:
        "Incluir um passo de teste com comando e fixture; até lá tratar cobertura de teste como lacuna, não como feito.",
    });
  }

  if (
    input.constraints.some((c) => /sem pagamento real|proibido cobrar/i.test(c)) &&
    input.steps.some((s) =>
      /processar pagamento|cobrar|capturar cartão/i.test(`${s.title} ${s.description}`),
    ) &&
    !input.steps.some((s) => /mock|sandbox|fake payment/i.test(`${s.title} ${s.description}`))
  ) {
    const step = pickStep(input, /pagamento|cobrar|cartão/i);
    const evidence = pickEvidence(input, /pagamento|sintético|mock/i);
    push({
      severity: "high",
      category: "risk",
      stepId: step.id,
      evidenceId: evidence.id,
      title: "Pagamento descrito sem mock explícito",
      hypothesis:
        "A restrição pede ausência de pagamento real, mas o passo de pagamento não cita mock/sandbox.",
      citedEvidence: cite(evidence),
      verificationAction:
        "Verificar se o passo nomeia provedor fake/sandbox e se não há chave de adquirente; a crítica não autoriza integração real.",
    });
  }

  if (
    /(vitrine|catálogo|checkout|formulário)/.test(all) &&
    !/(acessib|teclado|aria|foco visível|contraste)/.test(all)
  ) {
    const step = pickStep(input, /vitrine|catálogo|checkout|formulário|ui/i);
    const evidence = pickEvidence(input, /interface|catálogo|frontend/i);
    push({
      severity: "low",
      category: "gap",
      stepId: step.id,
      evidenceId: evidence.id,
      title: "Acessibilidade de teclado/contraste omitida",
      hypothesis:
        "Há UI de loja no plano e nenhum passo cita teclado, foco, ARIA ou contraste.",
      citedEvidence: cite(evidence),
      verificationAction:
        "Acrescentar critérios: Tab percorre CTA de compra, foco visível, contraste ≥ 4.5:1 no tema escolhido.",
    });
  }

  for (const ev of input.evidence) {
    if (INJECTION.test(ev.excerpt) || INJECTION.test(ev.source)) {
      const step = input.steps[0]!;
      push({
        severity: "high",
        category: "risk",
        stepId: step.id,
        evidenceId: ev.id,
        title: "Evidência com payload de instrução (não seguir)",
        hypothesis:
          "O trecho de evidência contém linguagem de injeção/jailbreak. O crítico ignora a instrução; não aprova o plano e não trata o texto como ordem.",
        citedEvidence: cite(ev),
        verificationAction:
          "Manter o campo como evidência bruta, não executar comandos nela; repetir a crítica só com evidência descritiva do domínio.",
      });
    }
  }

  return { findings };
}
