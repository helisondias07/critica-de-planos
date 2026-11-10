#!/usr/bin/env node
/**
 * Gera site/ — demo estática 100% no navegador (heurística + fixtures sintéticas).
 * Não inclui http-chat, MCP, credenciais nem chamadas /api.
 */
import * as esbuild from "esbuild";
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "site");
mkdirSync(outDir, { recursive: true });

await esbuild.build({
  absWorkingDir: root,
  entryPoints: ["web/static-entry.ts"],
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  outfile: join(outDir, "app.js"),
  sourcemap: true,
  legalComments: "none",
  logLevel: "info",
});

copyFileSync(join(root, "web/styles.css"), join(outDir, "styles.css"));

let html = readFileSync(join(root, "web/index.html"), "utf8");
html = html.replaceAll('href="/styles.css"', 'href="./styles.css"');
html = html.replaceAll('src="/app.js"', 'src="./app.js"');
html = html.replace(
  "<title>Crítica de planos — bancada local (não é LLM)</title>",
  "<title>Crítica de planos — demo estática (heurística no navegador)</title>",
);
html = html.replace(
  '<body>',
  `<body data-mode="static">
    <p class="static-banner" role="status">Demo estática: análise heurística local no seu navegador, sem modelo de IA hospedado, nenhum dado enviado</p>`,
);
html = html.replace(
  'data-transport="pending"',
  'data-transport="in-browser-heuristic"',
);
html = html.replace(
  ">Heurística determinística / replay / fake<",
  ">Demo estática: heurística local no navegador (não é IA hospedada)<",
);
html = html.replace(
  ">A carregar estado real do servidor…<",
  ">Demo estática: análise heurística local no seu navegador, sem modelo de IA hospedado, nenhum dado enviado<",
);
html = html.replace(
  "Roda um crítico <em>heurístico determinístico</em> no servidor local — o mesmo núcleo do CLI.",
  "Roda o mesmo crítico <em>heurístico determinístico</em> <strong>no seu navegador</strong> (bundle estático). Sem backend, sem /api, sem modelo hospedado.",
);
html = html.replace(
  `<option value="llm-pending">llm-pending (sempre unavailable)</option>
              <option value="http-chat">http-chat (desligado; not configured, sem fallback)</option>`,
  `<option value="fake:timeout">fake:timeout (simulação local; não é rede)</option>
              <option value="fake:error">fake:error (simulação local; não é rede)</option>
              <option value="fake:invalid">fake:invalid (simulação local; não é rede)</option>
              <option value="fake:invented">fake:invented (simulação local; não é rede)</option>`,
);
// the original still has fake:timeout etc. — remove duplicates by rebuilding the select
html = html.replace(
  /<select id="provider-select">[\s\S]*?<\/select>/,
  `<select id="provider-select">
              <option value="heuristic">heuristic (determinístico no navegador)</option>
              <option value="fake:ok">fake:ok (simulação local do mesmo núcleo)</option>
              <option value="fake:timeout">fake:timeout (simulação local; não é rede)</option>
              <option value="fake:error">fake:error (simulação local; não é rede)</option>
              <option value="fake:invalid">fake:invalid (simulação local; não é rede)</option>
              <option value="fake:invented">fake:invented (simulação local; não é rede)</option>
            </select>`,
);
html = html.replace(
  "Cada botão usa o núcleo real com provedor fake ou entrada inválida. Nada sai desta máquina.",
  "Simulações <strong>locais</strong> no navegador (timeout/invalid/error). Rotuladas como simulação — não são chamadas de rede nem de modelo.",
);
html = html.replace(
  "Crítico local, reproduzível depois de <code>npm ci</code>.",
  "Demo estática: <code>npm run build:static</code> → pasta <code>site/</code>. Sem dados enviados.",
);
writeFileSync(join(outDir, "index.html"), html);
process.stderr.write(`build estático → ${outDir}\n`);
