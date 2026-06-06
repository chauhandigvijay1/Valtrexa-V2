import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const clientDir = path.join(rootDir, "dist", "client");

function loadDotEnv() {
  const envPath = path.join(rootDir, ".env");
  const raw = readFileSync(envPath, "utf-8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed.slice(eq + 1).replace(/^"/, "").replace(/"$/, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

loadDotEnv();

const MIME_TYPES = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".ico", "image/x-icon"],
  [".js", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".txt", "text/plain; charset=utf-8"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

function toHeadersObject(headers) {
  if (headers && typeof headers === "object" && !("entries" in headers)) {
    return headers;
  }
  const result = {};
  for (const [key, value] of headers.entries()) {
    result[key] = value;
  }
  return result;
}

async function readNodeRequestBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

async function serveStatic(req, res, ssrHandler) {
  const url = new URL(req.url ?? "/", "http://localhost");
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.startsWith("/assets/")) {
    const filePath = path.join(clientDir, pathname);
    const buffer = await fs.readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, { "content-type": MIME_TYPES.get(ext) ?? "application/octet-stream" });
    res.end(buffer);
    return;
  }

  const request = new Request(`http://127.0.0.1:${process.env.PORT ?? "4173"}${req.url}`, {
    method: req.method,
    headers: toHeadersObject(req.headers),
  });
  const response = await ssrHandler.fetch(request);
  res.writeHead(response.status, toHeadersObject(response.headers));
  const arrayBuffer = await response.arrayBuffer();
  res.end(Buffer.from(arrayBuffer));
}

async function main() {
  const apiModule = await import(pathToFileURL(path.join(rootDir, "api", "[...route].ts")).href);
  const handler = apiModule.default;
  const ssrModule = await import(pathToFileURL(path.join(rootDir, "api", "ssr.ts")).href);
  const ssrHandler = ssrModule.default;

  const server = http.createServer(async (req, res) => {
    try {
      if ((req.url ?? "").startsWith("/api/")) {
        const body = await readNodeRequestBody(req);
        const request = new Request(`http://127.0.0.1:${process.env.PORT ?? "4173"}${req.url}`, {
          method: req.method,
          headers: toHeadersObject(req.headers),
          body: body && !["GET", "HEAD"].includes(req.method ?? "") ? body : undefined,
        });
        const response = await handler.fetch(request);
        res.writeHead(response.status, toHeadersObject(response.headers));
        const arrayBuffer = await response.arrayBuffer();
        res.end(Buffer.from(arrayBuffer));
        return;
      }

      await serveStatic(req, res, ssrHandler);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected local E2E server error.";
      res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: message }));
    }
  });

  const port = Number(process.env.PORT ?? "4173");
  server.listen(port, "127.0.0.1", () => {
    console.log(`Career Compass local E2E server listening on http://127.0.0.1:${port}`);
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
