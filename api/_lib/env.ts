import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

export function loadEnv(): void {
  const _dirname = dirname(fileURLToPath(import.meta.url));
  const projectRoot = resolve(_dirname, "..", "..");

  config({ path: resolve(projectRoot, ".env") });
  config({ path: resolve(projectRoot, ".env.local"), override: true });
}
