import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const web = join(dirname(fileURLToPath(import.meta.url)), "..", "web");

describe("marcação da bancada (a11y estática)", () => {
  const html = readFileSync(join(web, "index.html"), "utf8");
  const css = readFileSync(join(web, "styles.css"), "utf8");

  it("tem idioma, skip link, main, nav, dialog e live region", () => {
    assert.match(html, /lang="pt-BR"/);
    assert.match(html, /class="skip"/);
    assert.match(html, /<main id="principal"/);
    assert.match(html, /aria-label="Seções da bancada"/);
    assert.match(html, /aria-live="polite"/);
    assert.match(html, /role="alert"/);
    assert.match(html, /id="runtime-stamp"/);
    assert.match(html, /id="stamp-state"/);
    assert.match(html, /<dialog id="help-dialog"/);
  });

  it("CSS define foco visível, viewport estreita e reduced motion", () => {
    assert.match(css, /min-height: 44px/);
    assert.match(css, /:focus-visible/);
    assert.match(css, /@media \(max-width: 840px\)/);
    assert.match(css, /prefers-reduced-motion/);
    assert.match(css, /--ink: #f6f0e6/);
    assert.match(css, /--bg: #140f0c/);
  });

  it("não carrega CDN nem fonte remota", () => {
    assert.doesNotMatch(html, /https:\/\//);
    assert.doesNotMatch(css, /fonts\.google/);
    assert.doesNotMatch(html, /openai|anthropic|claude\.com/i);
  });
});
