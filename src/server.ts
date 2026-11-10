import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { DEFAULTS } from "./defaults.js";
import { listFixtureFiles, loadFixture, fixturesDir } from "./fixtures.js";
import { runCritique } from "./pipeline.js";
import { resolveProvider } from "./providers.js";
import { critiqueOutputSchema, planInputSchema } from "./schema.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const webDir = join(root, "web");

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

function send(res: ServerResponse, status: number, body: string | Buffer, type: string): void {
  res.writeHead(status, {
    "content-type": type,
    "cache-control": "no-store",
    "x-critica": "heuristic-not-llm",
  });
  res.end(body);
}

function sendJson(res: ServerResponse, status: number, data: unknown): void {
  send(res, status, JSON.stringify(data, null, 2), "application/json; charset=utf-8");
}

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buf.length;
    if (size > DEFAULTS.maxInputBytes) {
      throw Object.assign(new Error("payload grande demais"), { code: "PAYLOAD" });
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function serveStatic(urlPath: string, res: ServerResponse): void {
  let relative = urlPath === "/" ? "index.html" : urlPath.replace(/^\//, "");
  relative = relative.split("?")[0] ?? relative;
  const normalized = normalize(relative).replace(/^(\.\.[/\\])+/, "");
  const file = join(webDir, normalized);
  if (!file.startsWith(webDir) || !existsSync(file)) {
    send(res, 404, "não encontrado", "text/plain; charset=utf-8");
    return;
  }
  const type = MIME[extname(file)] ?? "application/octet-stream";
  send(res, 200, readFileSync(file), type);
}

export function createAppServer(): Server {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      const path = url.pathname;
      if (req.method === "GET" && path === "/api/health") {
        sendJson(res, 200, {
          ok: true,
          critic: "heuristic-deterministic",
          llm: false,
          hooks: false,
          status: "MVP local com integração de modelo real pendente",
        });
        return;
      }
      if (req.method === "GET" && path === "/api/schema") {
        sendJson(res, 200, { planInput: planInputSchema, critiqueOutput: critiqueOutputSchema });
        return;
      }
      if (req.method === "GET" && path === "/api/fixtures") {
        sendJson(res, 200, {
          dir: fixturesDir(),
          files: listFixtureFiles(),
        });
        return;
      }
      if (req.method === "GET" && path.startsWith("/api/fixtures/")) {
        const name = path.slice("/api/fixtures/".length);
        try {
          sendJson(res, 200, loadFixture(name));
        } catch {
          sendJson(res, 404, { error: { code: "NOT_FOUND", message: "fixture inexistente" } });
        }
        return;
      }
      if (req.method === "POST" && path === "/api/critique") {
        const text = await readBody(req);
        let body: Record<string, unknown> = {};
        try {
          body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
        } catch {
          sendJson(res, 400, {
            status: "input_error",
            findings: [],
            error: { code: "INPUT_ERROR", message: "JSON de request ilegível" },
          });
          return;
        }
        let input: unknown = body.input;
        if (typeof body.fixture === "string") {
          try {
            input = loadFixture(body.fixture);
          } catch {
            sendJson(res, 400, {
              status: "input_error",
              findings: [],
              error: { code: "INPUT_ERROR", message: "fixture inexistente" },
            });
            return;
          }
        }
        const providerName = typeof body.provider === "string" ? body.provider : "heuristic";
        let provider;
        try {
          provider = resolveProvider(providerName);
        } catch (err) {
          sendJson(res, 400, {
            status: "input_error",
            findings: [],
            error: { code: "INPUT_ERROR", message: err instanceof Error ? err.message : String(err) },
          });
          return;
        }
        const limits = (body.limits ?? {}) as Record<string, unknown>;
        const result = await runCritique(input, {
          provider,
          maxCalls: num(limits.maxCalls),
          maxRetries: num(limits.maxRetries),
          totalTimeoutMs: num(limits.totalTimeoutMs),
          attemptTimeoutMs: num(limits.attemptTimeoutMs),
          abortAfterMs: num(limits.abortAfterMs),
        });
        const httpStatus =
          result.status === "input_error" ? 400 : result.status === "ok" ? 200 : 200;
        sendJson(res, httpStatus, result);
        return;
      }
      if (req.method === "GET") {
        serveStatic(path, res);
        return;
      }
      send(res, 405, "método não suportado", "text/plain; charset=utf-8");
    } catch (err) {
      sendJson(res, 200, {
        status: "unavailable",
        criticKind: "unavailable",
        findings: [],
        error: { code: "UNAVAILABLE", message: err instanceof Error ? err.message : String(err) },
      });
    }
  });
}

function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function listenApp(port = 43147, host = "127.0.0.1"): Promise<{ server: Server; url: string }> {
  const server = createAppServer();
  return new Promise((resolve, reject) => {
    server.listen(port, host, () => {
      resolve({ server, url: `http://${host}:${port}` });
    });
    server.on("error", reject);
  });
}

const startedDirectly = process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js");
if (startedDirectly) {
  const port = Number(process.env.PORT ?? 43147);
  listenApp(port).then(({ url }) => {
    process.stderr.write(`Crítica de planos (UI local) em ${url}\n`);
    process.stderr.write("Heurística/fake apenas. Sem modelo real, sem hooks.\n");
  });
}
