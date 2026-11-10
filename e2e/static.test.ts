import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { readFileSync, existsSync, writeFileSync, mkdirSync } from "node:fs";
import { extname, join } from "node:path";
import { after, before, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import puppeteer, { type Browser, type Page, type HTTPRequest } from "puppeteer-core";
import { listenApp } from "../src/server.ts";
import { loadFixture } from "../src/fixtures.ts";

const CHROME = process.env.CHROME ?? "/usr/bin/google-chrome-stable";
const SITE = join(process.cwd(), "site");
const ART = process.env.ARTIFACT_DIR ?? "/opt/cursor/artifacts";

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".map": "application/json; charset=utf-8",
};

function luminance(rgb: { r: number; g: number; b: number }): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.7722 * lin(rgb.b);
}

function contrastRatio(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

function serveSite(): Promise<{ server: Server; url: string }> {
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    let relative = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\//, "");
    const file = join(SITE, relative);
    if (!file.startsWith(SITE) || !existsSync(file)) {
      res.writeHead(404);
      res.end("no");
      return;
    }
    res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${addr.port}` });
    });
    server.on("error", reject);
  });
}

const EXAMPLES = [
  "ecommerce-bad.json",
  "ecommerce-fixed.json",
  "ecommerce-good.json",
  "prompt-injection.json",
  "malformed.json",
  "timeout-lab.json",
] as const;

describe("E2E demo estática (servidor de ficheiros, sem backend)", { timeout: 180_000 }, () => {
  let fileServer: Server;
  let apiServer: Server;
  let staticUrl = "";
  let apiUrl = "";
  let browser: Browser;
  const networkLog: { url: string; method: string; resourceType: string }[] = [];
  const parity: unknown[] = [];

  before(async () => {
    assert.equal(existsSync(join(SITE, "index.html")), true, "corra npm run build:static antes");
    const files = await serveSite();
    fileServer = files.server;
    staticUrl = files.url;
    const api = await listenApp(0, "127.0.0.1");
    apiServer = api.server;
    const addr = apiServer.address() as AddressInfo;
    apiUrl = `http://127.0.0.1:${addr.port}`;
    browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  });

  after(async () => {
    mkdirSync(ART, { recursive: true });
    writeFileSync(join(ART, "network-log-v5.txt"), JSON.stringify(networkLog, null, 2));
    writeFileSync(join(ART, "parity-v5.txt"), JSON.stringify(parity, null, 2));
    await browser?.close();
    await new Promise<void>((r) => fileServer.close(() => r()));
    await new Promise<void>((r) => apiServer.close(() => r()));
  });

  async function openStatic(width: number, height: number): Promise<Page> {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: width < 500 ? 2 : 1 });
    await page.setRequestInterception(true);
    page.on("request", (req: HTTPRequest) => {
      const url = req.url();
      networkLog.push({ url, method: req.method(), resourceType: req.resourceType() });
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        void req.abort();
        return;
      }
      const origin = new URL(staticUrl).origin;
      if (parsed.pathname.startsWith("/api")) {
        void req.abort("blockedbyclient");
        return;
      }
      if (parsed.origin !== origin && parsed.protocol !== "data:") {
        void req.abort("blockedbyclient");
        return;
      }
      void req.continue();
    });
    await page.goto(staticUrl + "/", { waitUntil: "networkidle0" });
    return page;
  }

  it("aviso estático visível e sem /api no HTML", async () => {
    const page = await openStatic(1440, 900);
    const banner = await page.$eval(".static-banner", (el) => el.textContent ?? "");
    assert.match(banner, /Demo estática: análise heurística local no seu navegador/);
    assert.match(banner, /nenhum dado enviado/);
    const stamp = await page.$eval("#stamp-state", (el) => el.textContent ?? "");
    assert.match(stamp, /nenhum dado enviado/);
    const html = await page.content();
    assert.doesNotMatch(html, /\/api\/critique/);
    await page.close();
  });

  it("paridade de achados com o servidor local em cada exemplo", async () => {
    const page = await openStatic(1440, 900);
    for (const name of EXAMPLES) {
      const apiRes = await fetch(`${apiUrl}/api/critique`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ fixture: name, provider: "heuristic" }),
      });
      const apiBody = (await apiRes.json()) as {
        status: string;
        findings: { id: string; severity: string }[];
      };
      await page.click("#tab-exemplos");
      await page.select("#fixture-select", name);
      await page.click("#run-btn");
      await page.waitForFunction(
        () => (document.querySelector("#insp-achados-meta")?.textContent ?? "").includes("status="),
        { timeout: 8000 },
      );
      const browserMeta = await page.evaluate(() => {
        const meta = document.querySelector("#insp-achados-meta")?.textContent ?? "";
        const cards = [...document.querySelectorAll("[data-finding-id]")].map((el) => ({
          id: (el as HTMLElement).dataset.findingId,
          severity: (el as HTMLElement).dataset.severity,
        }));
        return { meta, cards };
      });
      const row = {
        fixture: name,
        apiStatus: apiBody.status,
        apiCount: apiBody.findings.length,
        apiIds: apiBody.findings.map((f) => f.id),
        apiSeverities: apiBody.findings.map((f) => f.severity),
        browserMeta: browserMeta.meta,
        browserIds: browserMeta.cards.map((c) => c.id),
        browserSeverities: browserMeta.cards.map((c) => c.severity),
      };
      parity.push(row);
      assert.equal(browserMeta.cards.length, apiBody.findings.length, name);
      assert.deepEqual(
        browserMeta.cards.map((c) => c.id),
        apiBody.findings.map((f) => f.id),
        name,
      );
      assert.deepEqual(
        browserMeta.cards.map((c) => c.severity),
        apiBody.findings.map((f) => f.severity),
        name,
      );
      void loadFixture(name);
    }
    await page.close();
  });

  it("teclado, overflow 390px, contraste do stamp, screenshots", async () => {
    const desktop = await openStatic(1440, 900);
    await desktop.focus("body");
    await desktop.keyboard.press("Tab");
    const first = await desktop.evaluate(() => (document.activeElement as HTMLElement | null)?.className);
    assert.match(first ?? "", /skip/);
    await desktop.screenshot({ path: join(ART, "ui-static-1440-bancada-v5.png"), fullPage: true });
    await desktop.click("#tab-exemplos");
    await desktop.select("#fixture-select", "ecommerce-bad.json");
    await desktop.screenshot({ path: join(ART, "ui-static-1440-exemplo-ruim-v5.png"), fullPage: true });
    await desktop.click("#run-btn");
    await desktop.waitForFunction(
      () => (document.querySelector("#insp-achados")?.textContent ?? "").includes("F01"),
      { timeout: 8000 },
    );
    const body = await desktop.evaluate(() => document.querySelector("#insp-achados")?.textContent ?? "");
    assert.match(body, /Ausência inferida/);
    await desktop.screenshot({ path: join(ART, "ui-static-1440-inspecao-v5.png"), fullPage: true });
    await desktop.close();

    const mobile = await openStatic(390, 844);
    const metrics = (await mobile.evaluate(`(() => {
      const parse = (color) => {
        const m = color.match(/rgba?\\((\\d+),\\s*(\\d+),\\s*(\\d+)/);
        if (!m) return null;
        return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
      };
      const stamp = document.querySelector(".stamp");
      const bg = parse(getComputedStyle(stamp).backgroundColor);
      const fg = parse(getComputedStyle(stamp).color);
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        bg, fg,
      };
    })()`)) as {
      scrollWidth: number;
      clientWidth: number;
      bg: { r: number; g: number; b: number } | null;
      fg: { r: number; g: number; b: number } | null;
    };
    assert.ok(metrics.scrollWidth <= metrics.clientWidth + 1, `overflow ${metrics.scrollWidth}`);
    assert.ok(metrics.bg && metrics.fg);
    const ratio = contrastRatio(metrics.bg!, metrics.fg!);
    assert.ok(ratio >= 4.5, `contraste ${ratio}`);
    await mobile.screenshot({ path: join(ART, "ui-static-390-bancada-v5.png"), fullPage: true });
    await mobile.click("#tab-exemplos");
    await mobile.select("#fixture-select", "ecommerce-bad.json");
    await mobile.screenshot({ path: join(ART, "ui-static-390-exemplo-ruim-v5.png"), fullPage: true });
    await mobile.click("#run-btn");
    await mobile.waitForFunction(
      () => (document.querySelector("#insp-achados")?.textContent ?? "").includes("F01"),
      { timeout: 8000 },
    );
    await mobile.screenshot({ path: join(ART, "ui-static-390-inspecao-v5.png"), fullPage: true });
    await mobile.close();
  });

  it("nenhuma requisição /api nem para fora de 127.0.0.1", () => {
    const origin = new URL(staticUrl).origin;
    const apiHits = networkLog.filter((r) => {
      try {
        return new URL(r.url).pathname.startsWith("/api");
      } catch {
        return false;
      }
    });
    const outbound = networkLog.filter((r) => {
      try {
        const u = new URL(r.url);
        if (u.protocol === "data:") return false;
        return u.origin !== origin;
      } catch {
        return true;
      }
    });
    assert.equal(apiHits.length, 0, JSON.stringify(apiHits));
    assert.equal(outbound.length, 0, JSON.stringify(outbound.slice(0, 10)));
  });
});
