#!/usr/bin/env node
/**
 * Lint mínimo e honesto deste recorte — não é ESLint/Prettier.
 * Recusa padrões que não devem ir para um bundle estático ou para um repo público.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const errors = [];

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "dist" || name === "site" || name === ".git") continue;
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, acc);
    else if (/\.(ts|js|mjs|html|css|md|json)$/.test(name)) acc.push(p);
  }
  return acc;
}

const files = walk(root);
const secretish = /AKIA[0-9A-Z]{16}|ghp_[A-Za-z0-9]{20,}|sk-[a-zA-Z0-9]{24,}|BEGIN (RSA |OPENSSH )?PRIVATE KEY/;

for (const file of files) {
  if (file.endsWith("package-lock.json")) continue;
  const text = readFileSync(file, "utf8");
  const rel = relative(root, file);
  if (secretish.test(text) && !rel.includes("lint.mjs")) {
    errors.push(`${rel}: padrão de segredo real recusado`);
  }
}

if (existsSync(join(root, "site", "app.js"))) {
  const bundle = readFileSync(join(root, "site", "app.js"), "utf8");
  const forbidden = [
    "/api/critique",
    "/api/health",
    "chat/completions",
    "CRITICA_LLM_API_KEY",
    "createHttpChatProvider",
    "mcp-stdio",
  ];
  for (const needle of forbidden) {
    if (bundle.includes(needle)) errors.push(`site/app.js contém ${needle} (não deve ir no bundle estático)`);
  }
}

if (errors.length) {
  process.stderr.write("lint falhou:\n" + errors.map((e) => ` - ${e}`).join("\n") + "\n");
  process.exit(1);
}
process.stderr.write("lint mínimo ok (script próprio; não é ESLint).\n");
