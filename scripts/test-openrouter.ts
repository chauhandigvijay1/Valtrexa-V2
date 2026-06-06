import { readFileSync } from "node:fs";
import path from "node:path";

function loadDotEnv() {
  const envPath = path.resolve(process.cwd(), ".env");
  const raw = readFileSync(envPath, "utf-8");
  const env: Record<string, string> = {};
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).replace(/^"/, "").replace(/"$/, "").trim();
    env[key] = value;
  }
  return env;
}

const env = loadDotEnv();
const apiKey = env.OPENROUTER_API_KEY;

async function testModel(model: string) {
  console.log(`\nTesting model: ${model}`);
  const body = {
    model,
    temperature: 0.1,
    messages: [
      { role: "system", content: "Extract name and skills. Return JSON only: {\"name\": \"\", \"skills\": []}" },
      { role: "user", content: "Jane Doe, TypeScript, React" }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "test_schema",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            name: { type: "string" },
            skills: { type: "array", items: { type: "string" } }
          },
          required: ["name", "skills"]
        }
      }
    }
  };

  try {
    const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    console.log(`Status: ${res.status} ${res.statusText}`);
    const data = await res.json();
    if (res.ok) {
      console.log("Content:", data?.choices?.[0]?.message?.content);
    } else {
      console.log("Error details:", JSON.stringify(data, null, 2));
    }
  } catch (err: any) {
    console.error("Fetch error:", err.message);
  }
}

async function main() {
  if (!apiKey) {
    console.error("Missing OPENROUTER_API_KEY");
    return;
  }
  await testModel("google/gemini-2.5-flash");
  await testModel("openai/gpt-4o-mini");
}

main().catch(console.error);
