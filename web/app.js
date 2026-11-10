const tabs = [...document.querySelectorAll('[role="tab"]')];
const panels = {
  "tab-bancada": document.getElementById("panel-bancada"),
  "tab-exemplos": document.getElementById("panel-exemplos"),
  "tab-inspecao": document.getElementById("panel-inspecao"),
  "tab-falhas": document.getElementById("panel-falhas"),
};
const fixtureSelect = document.getElementById("fixture-select");
const providerSelect = document.getElementById("provider-select");
const planPreview = document.getElementById("plan-preview");
const runBtn = document.getElementById("run-btn");
const runStatus = document.getElementById("run-status");
const errorBanner = document.getElementById("error-banner");
const helpDialog = document.getElementById("help-dialog");
const labOut = document.getElementById("lab-out");

let currentPlan = null;
let lastResult = null;

function showError(message) {
  errorBanner.hidden = false;
  errorBanner.textContent = message;
}

function clearError() {
  errorBanner.hidden = true;
  errorBanner.textContent = "";
}

function selectTab(id) {
  for (const tab of tabs) {
    const on = tab.id === id;
    tab.setAttribute("aria-selected", String(on));
    const panel = panels[tab.id];
    if (panel) panel.hidden = !on;
  }
  const current = document.getElementById(id);
  current?.focus();
}

tabs.forEach((tab, index) => {
  tab.addEventListener("click", () => selectTab(tab.id));
  tab.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      const dir = event.key === "ArrowRight" ? 1 : -1;
      const next = tabs[(index + dir + tabs.length) % tabs.length];
      selectTab(next.id);
    }
  });
});

async function loadFixture() {
  clearError();
  const name = fixtureSelect.value;
  const res = await fetch(`/api/fixtures/${name}`);
  if (!res.ok) {
    currentPlan = null;
    planPreview.textContent = "";
    showError("Não foi possível carregar a fixture (estado de erro da bancada).");
    return;
  }
  currentPlan = await res.json();
  planPreview.textContent = JSON.stringify(currentPlan, null, 2);
  renderEntrada(currentPlan);
  renderEvidencias(currentPlan);
}

function renderEntrada(plan) {
  const root = document.getElementById("insp-entrada");
  if (!plan || !plan.steps) {
    root.innerHTML = "<p>Entrada inválida ou ainda não carregada.</p>";
    return;
  }
  root.replaceChildren();
  const obj = document.createElement("p");
  obj.innerHTML = `<strong>Objetivo.</strong> ${escapeHtml(plan.objective)}`;
  root.append(obj);
  const cons = document.createElement("ul");
  for (const c of plan.constraints ?? []) {
    const li = document.createElement("li");
    li.textContent = c;
    cons.append(li);
  }
  root.append(cons);
  for (const step of plan.steps) {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<h3>${escapeHtml(step.id)} · ${escapeHtml(step.title)}</h3><p>${escapeHtml(step.description)}</p>`;
    root.append(card);
  }
}

function renderEvidencias(plan) {
  const root = document.getElementById("insp-evidencias");
  root.replaceChildren();
  if (!plan?.evidence) {
    root.innerHTML = "<p>Sem evidências carregadas.</p>";
    return;
  }
  for (const ev of plan.evidence) {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<h3>${escapeHtml(ev.id)}</h3><p class="meta">${escapeHtml(ev.source)}</p><p>${escapeHtml(ev.excerpt)}</p>`;
    root.append(card);
  }
}

function renderAchados(result) {
  const root = document.getElementById("insp-achados");
  root.replaceChildren();
  if (!result) {
    root.innerHTML = "<p>Corra uma crítica para ver achados. Nada é aprovado automaticamente.</p>";
    return;
  }
  const head = document.createElement("p");
  head.className = "meta";
  head.textContent = `status=${result.status} · ${result.criticKind} · provider=${result.meta?.providerId} · achados=${result.findings?.length ?? 0}`;
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
    card.innerHTML = `
      <h3>${escapeHtml(f.id)} · ${escapeHtml(f.title)}</h3>
      <p class="meta">${escapeHtml(f.severity)} / ${escapeHtml(f.category)} · ${escapeHtml(f.proofKind)} · passo ${escapeHtml(f.stepId)} · origem ${escapeHtml(f.sourceKind)}:${escapeHtml(f.sourceId)}</p>
      <p><strong>Hipótese.</strong> ${escapeHtml(f.hypothesis)}</p>
      <p><strong>Trecho observado.</strong> ${escapeHtml(f.citedEvidence)}</p>
      <p><strong>Verificação.</strong> ${escapeHtml(f.verificationAction)}</p>
      <p class="meta">Não executar esta verificação automaticamente.</p>`;
    root.append(card);
  }
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function runCritique(payload) {
  clearError();
  runStatus.textContent = "A correr crítico local…";
  runStatus.className = "status";
  try {
    const res = await fetch("/api/critique", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    lastResult = data;
    const tone = data.status === "ok" ? "ok" : "bad";
    runStatus.className = `status ${tone}`;
    runStatus.textContent = `status ${data.status} · ${data.criticKind} · ${data.findings?.length ?? 0} achados · transport=${data.meta?.transport ?? "n/a"} · NÃO executar`;
    renderAchados(data);
    if (payload.input) renderEntrada(payload.input);
    if (data.status === "input_error") {
      showError(`Erro de entrada distinguível: ${data.error?.message ?? "input_error"}`);
    } else if (data.status !== "ok") {
      showError(`Falha segura (${data.status}): achados vazios. Trabalho do chamador não é abortado além do status explícito.`);
    }
    return data;
  } catch (err) {
    showError("A bancada local não respondeu. Sem retry de rede externa — só este host.");
    runStatus.textContent = "unavailable (UI)";
    runStatus.className = "status bad";
    throw err;
  }
}

runBtn.addEventListener("click", async () => {
  await runCritique({
    fixture: fixtureSelect.value,
    provider: providerSelect.value,
  });
  selectTab("tab-inspecao");
});

fixtureSelect.addEventListener("change", loadFixture);

for (const btn of document.querySelectorAll("[data-lab]")) {
  btn.addEventListener("click", async () => {
    const kind = btn.getAttribute("data-lab");
    // Overrides de DEMO (não são os defaults do núcleo: maxCalls=3, retries=1, totalTimeoutMs=8000, attemptTimeoutMs=2500).
    const labs = {
      timeout: { fixture: "timeout-lab.json", provider: "fake:timeout", limits: { attemptTimeoutMs: 80, totalTimeoutMs: 200, maxRetries: 0 } },
      invalid: { fixture: "timeout-lab.json", provider: "fake:invalid" },
      error: { fixture: "timeout-lab.json", provider: "fake:error" },
      invented: { fixture: "timeout-lab.json", provider: "fake:invented" },
      limit: { fixture: "timeout-lab.json", provider: "heuristic", limits: { maxCalls: 0 } },
      malformed: { fixture: "malformed.json", provider: "heuristic" },
    };
    const data = await runCritique(labs[kind]);
    labOut.textContent = JSON.stringify(data, null, 2);
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "?" && !event.ctrlKey && !event.metaKey && event.target === document.body || event.key === "?" && event.target.tagName !== "INPUT" && event.target.tagName !== "TEXTAREA" && event.target.tagName !== "SELECT") {
    if (event.key === "?") {
      event.preventDefault();
      helpDialog.showModal();
    }
  }
  if (event.key === "Escape" && helpDialog.open) helpDialog.close();
  if (event.altKey && event.key === "1") { event.preventDefault(); selectTab("tab-bancada"); }
  if (event.altKey && event.key === "2") { event.preventDefault(); selectTab("tab-exemplos"); }
  if (event.altKey && event.key === "3") { event.preventDefault(); selectTab("tab-inspecao"); }
  if (event.altKey && event.key === "4") { event.preventDefault(); selectTab("tab-falhas"); }
  if (event.altKey && (event.key === "r" || event.key === "R")) {
    event.preventDefault();
    runBtn.click();
  }
});

document.getElementById("help-close").addEventListener("click", () => helpDialog.close());

renderAchados(null);
loadFixture();
