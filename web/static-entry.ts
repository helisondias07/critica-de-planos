import type { CritiqueResult } from "../src/contract.js";
import { runCritique, resolveLocalProvider } from "../src/browser-core.js";
import bad from "../fixtures/ecommerce-bad.json";
import fixed from "../fixtures/ecommerce-fixed.json";
import good from "../fixtures/ecommerce-good.json";
import injection from "../fixtures/prompt-injection.json";
import malformed from "../fixtures/malformed.json";
import timeoutLab from "../fixtures/timeout-lab.json";

const FIXTURES: Record<string, unknown> = {
  "ecommerce-bad.json": bad,
  "ecommerce-fixed.json": fixed,
  "ecommerce-good.json": good,
  "prompt-injection.json": injection,
  "malformed.json": malformed,
  "timeout-lab.json": timeoutLab,
};

const STATIC_STAMP = {
  kind: "Demo estática: heurística local no navegador (não é IA hospedada)",
  state: "Demo estática: análise heurística local no seu navegador, sem modelo de IA hospedado, nenhum dado enviado",
  transport: "in-browser-heuristic",
};

const tabs = [...document.querySelectorAll('[role="tab"]')] as HTMLElement[];
const panels: Record<string, HTMLElement | null> = {
  "tab-bancada": document.getElementById("panel-bancada"),
  "tab-exemplos": document.getElementById("panel-exemplos"),
  "tab-inspecao": document.getElementById("panel-inspecao"),
  "tab-falhas": document.getElementById("panel-falhas"),
};
const fixtureSelect = document.getElementById("fixture-select") as HTMLSelectElement;
const providerSelect = document.getElementById("provider-select") as HTMLSelectElement;
const planPreview = document.getElementById("plan-preview") as HTMLElement;
const runBtn = document.getElementById("run-btn") as HTMLButtonElement;
const runStatus = document.getElementById("run-status") as HTMLElement;
const errorBanner = document.getElementById("error-banner") as HTMLElement;
const helpDialog = document.getElementById("help-dialog") as HTMLDialogElement;
const labOut = document.getElementById("lab-out") as HTMLElement;

let currentPlan: unknown = null;

function showError(message: string) {
  errorBanner.hidden = false;
  errorBanner.textContent = message;
}

function clearError() {
  errorBanner.hidden = true;
  errorBanner.textContent = "";
}

function selectTab(id: string) {
  for (const tab of tabs) {
    const on = tab.id === id;
    tab.setAttribute("aria-selected", String(on));
    const panel = panels[tab.id];
    if (panel) panel.hidden = !on;
  }
  document.getElementById(id)?.focus();
}

tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => selectTab(tab.id));
  tab.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const dir = event.key === "ArrowRight" ? 1 : -1;
      const next = tabs[(index + dir + tabs.length) % tabs.length];
      if (next) selectTab(next.id);
    }
  });
});

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function loadFixture() {
  clearError();
  const name = fixtureSelect.value;
  const plan = FIXTURES[name];
  if (plan === undefined) {
    currentPlan = null;
    planPreview.textContent = "";
    showError("Fixture inexistente neste recorte estático.");
    return;
  }
  currentPlan = plan;
  planPreview.textContent = JSON.stringify(plan, null, 2);
  renderEntrada(plan as Record<string, unknown>);
  renderEvidencias(plan as Record<string, unknown>);
}

function renderEntrada(plan: Record<string, unknown> | null) {
  const root = document.getElementById("insp-entrada")!;
  if (!plan || !Array.isArray(plan.steps)) {
    root.innerHTML = "<p>Entrada inválida ou ainda não carregada.</p>";
    return;
  }
  root.replaceChildren();
  const obj = document.createElement("p");
  obj.innerHTML = `<strong>Objetivo.</strong> ${escapeHtml(plan.objective)}`;
  root.append(obj);
  const cons = document.createElement("ul");
  for (const c of (plan.constraints as unknown[]) ?? []) {
    const li = document.createElement("li");
    li.textContent = String(c);
    cons.append(li);
  }
  root.append(cons);
  for (const step of plan.steps as Record<string, string>[]) {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<h3>${escapeHtml(step.id)} · ${escapeHtml(step.title)}</h3><p>${escapeHtml(step.description)}</p>`;
    root.append(card);
  }
}

function renderEvidencias(plan: Record<string, unknown> | null) {
  const root = document.getElementById("insp-evidencias")!;
  root.replaceChildren();
  if (!plan || !Array.isArray(plan.evidence)) {
    root.innerHTML = "<p>Sem evidências carregadas.</p>";
    return;
  }
  for (const ev of plan.evidence as Record<string, string>[]) {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<h3>${escapeHtml(ev.id)}</h3><p class="meta">${escapeHtml(ev.source)}</p><p>${escapeHtml(ev.excerpt)}</p>`;
    root.append(card);
  }
}

function proofQuoteLabel(kind: string) {
  if (kind === "inferred-absence") {
    return "Ausência inferida (contexto observado; não prova o que falta)";
  }
  return "Trecho observado na origem declarada";
}

function renderAchados(result: CritiqueResult | null) {
  const root = document.getElementById("insp-achados")!;
  root.replaceChildren();
  if (!result) {
    root.innerHTML = "<p>Corra uma crítica para ver achados. Nada é aprovado automaticamente.</p>";
    return;
  }
  const head = document.createElement("p");
  head.className = "meta";
  head.id = "insp-achados-meta";
  head.textContent = `status=${result.status} · ${result.criticKind} · provider=${result.meta?.providerId} · transport=${result.meta?.transport ?? "n/a"} · achados=${result.findings?.length ?? 0}`;
  root.append(head);
  if (result.error) {
    const err = document.createElement("div");
    err.className = "card sev-critical";
    err.innerHTML = `<h3>${escapeHtml(result.error.code)}</h3><p>${escapeHtml(result.error.message)}</p>`;
    root.append(err);
  }
  if (!result.findings?.length) {
    const empty = document.createElement("p");
    empty.textContent =
      result.status === "ok"
        ? "Nenhum achado passou na validação. Isso não é aprovação do plano."
        : "Achados vazios (falha segura). O chamador pode seguir; isto não valida o plano.";
    root.append(empty);
    return;
  }
  for (const f of result.findings) {
    const card = document.createElement("article");
    card.className = `card sev-${f.severity}`;
    card.dataset.findingId = f.id;
    card.dataset.severity = f.severity;
    const quoteLabel = proofQuoteLabel(f.proofKind);
    card.innerHTML = `
      <h3>${escapeHtml(f.id)} · ${escapeHtml(f.title)}</h3>
      <p class="meta">${escapeHtml(f.severity)} / ${escapeHtml(f.category)} · ${escapeHtml(f.proofKind)} · passo ${escapeHtml(f.stepId)} · origem ${escapeHtml(f.sourceKind)}:${escapeHtml(f.sourceId)}</p>
      <p><strong>Hipótese.</strong> ${escapeHtml(f.hypothesis)}</p>
      <p><strong>${escapeHtml(quoteLabel)}.</strong> ${escapeHtml(f.citedEvidence)}</p>
      <p><strong>Verificação.</strong> ${escapeHtml(f.verificationAction)}</p>
      <p class="meta">Não executar esta verificação automaticamente.</p>`;
    root.append(card);
  }
}

function applyStamp() {
  const root = document.getElementById("runtime-stamp");
  const kind = document.getElementById("stamp-kind");
  const state = document.getElementById("stamp-state");
  if (!root || !kind || !state) return;
  kind.textContent = STATIC_STAMP.kind;
  state.textContent = STATIC_STAMP.state;
  root.dataset.transport = STATIC_STAMP.transport;
}

function withTransport(name: string) {
  const provider = resolveLocalProvider(name);
  return {
    ...provider,
    transport: name.startsWith("fake:") && name !== "fake:ok" && name !== "fake"
      ? "in-browser-simulated-failure"
      : "in-browser-heuristic",
    critique: provider.critique.bind(provider),
  };
}

async function runLocal(payload: {
  fixture?: string;
  input?: unknown;
  provider?: string;
  limits?: Record<string, number>;
}): Promise<CritiqueResult> {
  clearError();
  runStatus.textContent = "A correr crítico heurístico no navegador…";
  runStatus.className = "status";
  const input = payload.input ?? (payload.fixture ? FIXTURES[payload.fixture] : currentPlan);
  const providerName = payload.provider ?? providerSelect.value;
  const provider = withTransport(providerName);
  const data = await runCritique(input, {
    provider,
    maxCalls: payload.limits?.maxCalls,
    maxRetries: payload.limits?.maxRetries,
    totalTimeoutMs: payload.limits?.totalTimeoutMs,
    attemptTimeoutMs: payload.limits?.attemptTimeoutMs,
  });
  const tone = data.status === "ok" ? "ok" : "bad";
  runStatus.className = `status ${tone}`;
  runStatus.textContent = `status ${data.status} · ${data.criticKind} · ${data.findings?.length ?? 0} achados · transport=${data.meta?.transport ?? "n/a"} · NÃO executar`;
  renderAchados(data);
  if (payload.input && typeof payload.input === "object") {
    renderEntrada(payload.input as Record<string, unknown>);
  }
  if (data.status === "input_error") {
    showError(`Erro de entrada distinguível: ${data.error?.message ?? "input_error"}`);
  } else if (data.status !== "ok") {
    showError(`Falha simulada localmente (${data.status}): não é chamada de rede. Achados vazios.`);
  }
  return data;
}

runBtn.addEventListener("click", async () => {
  await runLocal({
    fixture: fixtureSelect.value,
    provider: providerSelect.value,
  });
  selectTab("tab-inspecao");
});

fixtureSelect.addEventListener("change", loadFixture);

for (const btn of document.querySelectorAll("[data-lab]")) {
  btn.addEventListener("click", async () => {
    const kind = btn.getAttribute("data-lab");
    const labs: Record<string, { fixture: string; provider: string; limits?: Record<string, number> }> = {
      timeout: {
        fixture: "timeout-lab.json",
        provider: "fake:timeout",
        limits: { attemptTimeoutMs: 80, totalTimeoutMs: 200, maxRetries: 0 },
      },
      invalid: { fixture: "timeout-lab.json", provider: "fake:invalid" },
      error: { fixture: "timeout-lab.json", provider: "fake:error" },
      invented: { fixture: "timeout-lab.json", provider: "fake:invented" },
      limit: { fixture: "timeout-lab.json", provider: "heuristic", limits: { maxCalls: 0 } },
      malformed: { fixture: "malformed.json", provider: "heuristic" },
    };
    if (!kind || !labs[kind]) return;
    const data = await runLocal(labs[kind]);
    labOut.textContent = JSON.stringify(data, null, 2);
  });
}

document.addEventListener("keydown", (event) => {
  const tag = (event.target as HTMLElement | null)?.tagName;
  if (event.key === "?" && tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") {
    event.preventDefault();
    helpDialog.showModal();
  }
  if (event.key === "Escape" && helpDialog.open) helpDialog.close();
  if (event.altKey && event.key === "1") {
    event.preventDefault();
    selectTab("tab-bancada");
  }
  if (event.altKey && event.key === "2") {
    event.preventDefault();
    selectTab("tab-exemplos");
  }
  if (event.altKey && event.key === "3") {
    event.preventDefault();
    selectTab("tab-inspecao");
  }
  if (event.altKey && event.key === "4") {
    event.preventDefault();
    selectTab("tab-falhas");
  }
  if (event.altKey && (event.key === "r" || event.key === "R")) {
    event.preventDefault();
    runBtn.click();
  }
});

document.getElementById("help-close")?.addEventListener("click", () => helpDialog.close());

applyStamp();
renderAchados(null);
loadFixture();
