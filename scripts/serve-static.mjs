#!/usr/bin/env node
/** Servidor de ficheiros simples para site/. Sem rotas /api. */
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "site");
const port = Number(process.env.PORT ?? 43151);
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (url.pathname.startsWith("/api")) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("esta demo estática não tem /api");
    return;
  }
  let relative = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\//, "");
  relative = normalize(relative).replace(/^(\.\.[/\\])+/, "");
  const file = join(root, relative);
  if (!file.startsWith(root) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("não encontrado");
    return;
  }
  const type = MIME[extname(file)] ?? "application/octet-stream";
  res.writeHead(200, { "content-type": type, "cache-control": "no-store" });
  res.end(readFileSync(file));
});

server.listen(port, "127.0.0.1", () => {
  process.stderr.write(`Demo estática (só ficheiros) em http://127.0.0.1:${port}\n`);
});
