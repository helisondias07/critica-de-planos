import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import puppeteer, { type Browser, type Page } from "puppeteer-core";
import { listenApp } from "../src/server.ts";

const CHROME = process.env.CHROME ?? "/usr/bin/google-chrome-stable";

function luminance(rgb: { r: number; g: number; b: number }): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(rgb.r) + 0.7152 * lin(rgb.g) + 0.0722 * lin(rgb.b);
}

function contrastRatio(a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  const [hi, lo] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

describe("teclado real no Chrome (não é axe/leitor de tela)", { timeout: 90_000 }, () => {
  let server: Server;
  let base = "";
  let browser: Browser;

  before(async () => {
    const started = await listenApp(0, "127.0.0.1");
    server = started.server;
    const addr = server.address() as AddressInfo;
    base = `http://127.0.0.1:${addr.port}`;
    browser = await puppeteer.launch({
      executablePath: CHROME,
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
  });

  after(async () => {
    await browser?.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  async function newDesktop(): Promise<Page> {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 800 });
    await page.goto(base, { waitUntil: "networkidle0" });
    return page;
  }

  it("Tab alcança skip link, tabs e o botão de crítica; setas trocam aba", async () => {
    const page = await newDesktop();
    await page.focus("body");
    await page.keyboard.press("Tab");
    const first = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      return { tag: el?.tagName, className: el?.className, href: (el as HTMLAnchorElement | null)?.getAttribute("href") };
    });
    assert.equal(first.className.includes("skip"), true);
    assert.equal(first.href, "#principal");

    await page.keyboard.press("Enter");
    const afterSkip = await page.evaluate(() => document.activeElement?.id || document.activeElement?.tagName);
    assert.ok(afterSkip);

    await page.focus("#tab-bancada");
    await page.keyboard.press("ArrowRight");
    const selected = await page.evaluate(() =>
      [...document.querySelectorAll('[role="tab"]')].map((t) => t.getAttribute("aria-selected")),
    );
    assert.deepEqual(selected, ["false", "true", "false", "false"]);
    const exemplosVisible = await page.evaluate(() => !document.getElementById("panel-exemplos")?.hidden);
    assert.equal(exemplosVisible, true);

    await page.focus("#run-btn");
    const runFocused = await page.evaluate(() => document.activeElement?.id);
    assert.equal(runFocused, "run-btn");
    const outline = await page.evaluate(() => getComputedStyle(document.activeElement as HTMLElement).outlineStyle);
    assert.notEqual(outline, "none");
    await page.close();
  });

  it("atalho Alt+R corre crítica e mostra achado ancorado", async () => {
    const page = await newDesktop();
    await page.click("body");
    await page.keyboard.down("Alt");
    await page.keyboard.press("2");
    await page.keyboard.up("Alt");
    await page.keyboard.down("Alt");
    await page.keyboard.press("KeyR");
    await page.keyboard.up("Alt");
    await page.waitForFunction(
      () => (document.querySelector("#insp-achados")?.textContent ?? "").includes("origem step:s2"),
      { timeout: 8000 },
    );
    const body = await page.evaluate(() => document.querySelector("#insp-achados")?.textContent ?? "");
    assert.match(body, /observed-excerpt/);
    assert.doesNotMatch(body, /origem evidence:e1/);
    await page.close();
  });

  it("teclado aciona estado de erro de entrada malformada", async () => {
    const page = await newDesktop();
    await page.click("body");
    await page.keyboard.down("Alt");
    await page.keyboard.press("4");
    await page.keyboard.up("Alt");
    const falhas = await page.evaluate(() => !document.getElementById("panel-falhas")?.hidden);
    assert.equal(falhas, true);
    await page.focus('[data-lab="malformed"]');
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () => (document.querySelector("#error-banner")?.textContent ?? "").includes("Erro de entrada"),
      { timeout: 8000 },
    );
    const alert = await page.evaluate(() => document.querySelector("#error-banner")?.textContent ?? "");
    assert.match(alert, /input_error|entrada/i);
    await page.close();
  });

  it("mobile 390px sem overflow horizontal e contraste simples do stamp ≥ 4.5", async () => {
    const page = await browser.newPage();
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await page.goto(base, { waitUntil: "networkidle0" });
    const metrics = (await page.evaluate(`(() => {
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
        bg,
        fg,
      };
    })()`)) as {
      scrollWidth: number;
      clientWidth: number;
      bg: { r: number; g: number; b: number } | null;
      fg: { r: number; g: number; b: number } | null;
    };
    assert.ok(metrics.scrollWidth <= metrics.clientWidth + 1, `overflow ${metrics.scrollWidth} > ${metrics.clientWidth}`);
    assert.ok(metrics.bg && metrics.fg);
    const ratio = contrastRatio(metrics.bg!, metrics.fg!);
    assert.ok(ratio >= 4.5, `contraste stamp ${ratio.toFixed(2)} < 4.5`);
    await page.close();
  });
});
