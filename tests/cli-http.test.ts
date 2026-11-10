import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { after, before, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import { runCli } from "../src/cli.ts";
import { listenApp } from "../src/server.ts";
import type { Server } from "node:http";

function collect(stream: PassThrough): Promise<string> {
  const chunks: Buffer[] = [];
  return new Promise((resolve) => {
    stream.on("data", (c) => chunks.push(Buffer.from(c)));
    stream.on("finish", () => resolve(Buffer.concat(chunks).toString("utf8")));
  });
}

describe("CLI streams e exit codes", () => {
  it("JSON em stdout e resumo em stderr no plano ruim", async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const outP = collect(stdout);
    const errP = collect(stderr);
    const code = await runCli(["--input", "fixtures/ecommerce-bad.json"], { stdout, stderr });
    stdout.end();
    stderr.end();
    const out = await outP;
    const err = await errP;
    assert.equal(code, 0);
    const parsed = JSON.parse(out);
    assert.equal(parsed.status, "ok");
    assert.equal(out.includes("Crítica de planos — revisão"), false);
    assert.match(err, /NÃO é segundo LLM/);
    assert.match(err, /heuristic/);
  });

  it("input ilegível usa exit 2 e JSON de input_error", async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const outP = collect(stdout);
    stdout.on("end", () => undefined);
    const code = await runCli(["--input", "fixtures/nao-existe.json", "--json-only"], {
      stdout,
      stderr,
    });
    stdout.end();
    stderr.end();
    const out = await outP;
    assert.equal(code, 2);
    assert.equal(JSON.parse(out).status, "input_error");
  });

  it("--json-only não mistura resumo em stdout", async () => {
    const stdout = new PassThrough();
    const stderr = new PassThrough();
    const outP = collect(stdout);
    const errP = collect(stderr);
    await runCli(["fixtures/ecommerce-good.json", "--json-only"], { stdout, stderr });
    stdout.end();
    stderr.end();
    const out = await outP;
    const err = await errP;
    JSON.parse(out);
    assert.equal(err, "");
  });
});

describe("HTTP local", () => {
  let server: Server;
  let base = "";

  before(async () => {
    const started = await listenApp(0, "127.0.0.1");
    server = started.server;
    const addr = server.address() as AddressInfo;
    base = `http://127.0.0.1:${addr.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it("health declara ausência de LLM e hooks", async () => {
    const res = await fetch(`${base}/api/health`);
    const body = await res.json();
    assert.equal(body.llm, false);
    assert.equal(body.hooks, false);
  });

  it("página inicial traz stamp de heurística e skip link", async () => {
    const res = await fetch(`${base}/`);
    const html = await res.text();
    assert.equal(res.headers.get("content-type")?.includes("text/html"), true);
    assert.match(html, /Saltar para o conteúdo/);
    assert.match(html, /NÃO é segundo LLM/);
    assert.match(html, /role="tablist"/);
    assert.match(html, /role="alert"/);
  });

  it("POST critique do plano ruim", async () => {
    const res = await fetch(`${base}/api/critique`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fixture: "ecommerce-bad.json", provider: "heuristic" }),
    });
    const body = await res.json();
    assert.equal(body.status, "ok");
    assert.ok(body.findings.length >= 1);
  });

  it("POST malformado distingue input_error", async () => {
    const res = await fetch(`${base}/api/critique`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fixture: "malformed.json" }),
    });
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.status, "input_error");
  });
});
