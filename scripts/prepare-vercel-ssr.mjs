import { cp, mkdir, rm, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(root, "dist/server");
const target = resolve(root, "api/_dist");

async function assertDirectory(path, label) {
  const info = await stat(path).catch(() => undefined);
  if (!info?.isDirectory()) {
    throw new Error(`${label} does not exist or is not a directory: ${path}`);
  }
}

await assertDirectory(source, "TanStack Start server output");
await mkdir(dirname(target), { recursive: true });
await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true });
await assertDirectory(resolve(target, "assets"), "Copied TanStack Start server assets");
