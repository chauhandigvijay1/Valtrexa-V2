import { readFileSync } from "node:fs";
import path from "node:path";

type Result = { ok: boolean; missing: string[]; present: string[] };

function loadDotEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  const raw = readFileSync(envPath, "utf-8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq);
    const value = trimmed
      .slice(eq + 1)
      .replace(/^"/, "")
      .replace(/"$/, "");
    if (!process.env[key]) process.env[key] = value;
  }
}

async function fetchOpenApi(baseUrl: string, apiKey: string) {
  const url = `${baseUrl.replace(/\/$/, "")}/rest/v1/`;
  const res = await fetch(url, {
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/openapi+json",
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch PostgREST OpenAPI (${res.status}): ${await res.text()}`);
  }
  return JSON.parse(await res.text());
}

async function main() {
  loadDotEnv();

  const baseUrl = process.env.SUPABASE_URL;
  const apiKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !apiKey)
    throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env");

  const targets = [
    "resume_parses",
    "resume_analyses",
    "tailored_resumes",
    "workflow_events",
    "job_import_runs",
    "n8n_webhook_subscriptions",
    "notification_queue",
    "alert_preferences",
    "loom_scripts",
  ];

  const spec = await fetchOpenApi(baseUrl, apiKey);
  const paths = new Set<string>(Object.keys(spec.paths ?? {}));
  const defs = spec.definitions ?? {};

  const result: Result = { ok: true, missing: [], present: [] };

  for (const t of targets) {
    const hasPath = paths.has(`/${t}`) || paths.has(`/${t}/`);
    const hasDefinition = !!defs[t];
    const ok = hasPath && hasDefinition;
    if (!ok) {
      result.ok = false;
      result.missing.push(t);
      console.log(`MISSING: ${t} (path=${hasPath} definition=${hasDefinition})`);
      continue;
    }

    const columns = Object.keys(defs[t]?.properties ?? {});
    result.present.push(t);
    console.log(`OK: ${t} (columns=${columns.length})`);
  }

  if (!result.ok) {
    console.error(
      JSON.stringify(
        {
          ok: result.ok,
          missing: result.missing,
          present: result.present,
          hint: "Apply supabase/sql/20260602_release_schema_missing_tables.sql in Supabase SQL Editor, then re-run this script.",
        },
        null,
        2,
      ),
    );
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ ok: true, verified: result.present }, null, 2));
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
