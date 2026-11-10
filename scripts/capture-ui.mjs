/**
 * Captura screenshots com Chrome do sistema.
 * Opcional: `npm install --no-save puppeteer-core` (não faz parte do runtime do experimento).
 */
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const suffix = process.env.SHOT_SUFFIX ?? "-v3";
const out = process.env.ARTIFACT_DIR ?? "/opt/cursor/artifacts";
mkdirSync(out, { recursive: true });
const chrome = process.env.CHROME ?? "/usr/bin/google-chrome-stable";
const url = process.env.DEMO_URL ?? "http://127.0.0.1:43147/";

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage", "--hide-scrollbars"],
});

async function shot(page, name) {
  const file = `${out}/${name}`;
  await page.screenshot({ path: file, fullPage: true });
  console.log("wrote", file);
}

try {
  const desktop = await browser.newPage();
  await desktop.setViewport({ width: 1280, height: 800, deviceScaleFactor: 1 });
  await desktop.goto(url, { waitUntil: "networkidle0" });
  await desktop.waitForFunction(
    () => !(document.getElementById("stamp-state")?.textContent ?? "").includes("A carregar"),
    { timeout: 8000 },
  );
  await shot(desktop, `ui-desktop-bancada${suffix}.png`);

  await desktop.click("#tab-exemplos");
  await desktop.waitForSelector("#plan-preview");
  await new Promise((r) => setTimeout(r, 250));
  await shot(desktop, `ui-desktop-exemplos-ruim${suffix}.png`);

  await desktop.click("#run-btn");
  await desktop.waitForFunction(
    () => document.querySelector("#insp-achados")?.textContent?.includes("F01"),
    { timeout: 8000 },
  );
  const inspectionText = await desktop.evaluate(() => document.querySelector("#insp-achados")?.textContent ?? "");
  if (!inspectionText.includes("Ausência inferida")) {
    throw new Error("screenshot: expected inferred-absence label");
  }
  await shot(desktop, `ui-desktop-inspecao-ruim${suffix}.png`);

  await desktop.click("#tab-exemplos");
  await desktop.select("#fixture-select", "ecommerce-good.json");
  await new Promise((r) => setTimeout(r, 200));
  await desktop.click("#run-btn");
  await desktop.waitForFunction(
    () => document.querySelector("#run-status")?.textContent?.includes("status ok"),
    { timeout: 8000 },
  );
  await shot(desktop, `ui-desktop-inspecao-bom${suffix}.png`);

  await desktop.click("#tab-falhas");
  await (await desktop.$('[data-lab="timeout"]')).click();
  await desktop.waitForFunction(
    () => document.querySelector("#lab-out")?.textContent?.includes("unavailable"),
    { timeout: 8000 },
  );
  await shot(desktop, `ui-desktop-falhas-timeout${suffix}.png`);

  await (await desktop.$('[data-lab="invalid"]')).click();
  await desktop.waitForFunction(
    () => document.querySelector("#lab-out")?.textContent?.includes("invalid"),
    { timeout: 8000 },
  );
  await shot(desktop, `ui-desktop-falhas-invalid${suffix}.png`);

  const mobile = await browser.newPage();
  await mobile.setViewport({
    width: 390,
    height: 844,
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  await mobile.goto(url, { waitUntil: "networkidle0" });
  await mobile.waitForFunction(
    () => !(document.getElementById("stamp-state")?.textContent ?? "").includes("A carregar"),
    { timeout: 8000 },
  );
  await shot(mobile, `ui-mobile-bancada${suffix}.png`);
  await mobile.click("#tab-exemplos");
  await new Promise((r) => setTimeout(r, 200));
  await mobile.click("#run-btn");
  await mobile.waitForFunction(
    () => document.querySelector("#insp-achados")?.textContent?.includes("F01"),
    { timeout: 8000 },
  );
  await shot(mobile, `ui-mobile-inspecao${suffix}.png`);
  await mobile.click("#tab-falhas");
  await (await mobile.$('[data-lab="malformed"]')).click();
  await mobile.waitForFunction(
    () =>
      (document.querySelector("#error-banner")?.textContent ?? "").includes("entrada") ||
      (document.querySelector("#lab-out")?.textContent ?? "").includes("input_error"),
    { timeout: 8000 },
  );
  await shot(mobile, `ui-mobile-erro${suffix}.png`);
} finally {
  await browser.close();
}
