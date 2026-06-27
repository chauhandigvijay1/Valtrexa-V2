import { config } from "dotenv";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

export function loadEnv(): void {
  const _dirname = dirname(fileURLToPath(import.meta.url));
  const projectRoot = resolve(_dirname, "..", "..");

  config({ path: resolve(projectRoot, ".env") });
  config({ path: resolve(projectRoot, ".env.local"), override: true });
}

/** Absolute path to the Microsoft Edge Stable executable (set via EDGE_PATH), if any. */
export function getEdgePath(): string | undefined {
  return process.env.EDGE_PATH;
}

/** Directory for persistent Edge user profile data (set via EDGE_USER_DATA_DIR), if any. */
export function getEdgeUserDataDir(): string | undefined {
  return process.env.EDGE_USER_DATA_DIR;
}

/** Edge profile directory name (set via EDGE_PROFILE_DIRECTORY), defaults to "Default". */
export function getEdgeProfileDirectory(): string {
  return process.env.EDGE_PROFILE_DIRECTORY || "Default";
}
