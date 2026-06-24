import Database from "better-sqlite3";
import { readFileSync } from "fs";

const dbPath = process.env.USERPROFILE + "/.n8n/database.sqlite";
const db = new Database(dbPath);

// Get the current workflow
const wf = db
  .prepare(
    "SELECT id, name, nodes, connections, active, versionId, versionCounter FROM workflow_entity WHERE name LIKE '%VALTREXA-V2%'",
  )
  .get() as any;
if (!wf) {
  console.log("No VALTREXA-V2 workflow found");
  process.exit(1);
}

console.log(`Workflow: ${wf.name} (${wf.id})`);
console.log(`Active: ${wf.active}`);
console.log(`Version: ${wf.versionCounter} (${wf.versionId})`);
console.log(`Nodes: ${JSON.parse(wf.nodes).length}`);
console.log(`Connections: ${Object.keys(JSON.parse(wf.connections || "{}")).length} sources`);

const nodes = JSON.parse(wf.nodes);
const connections = JSON.parse(wf.connections || "{}");

// List all nodes
console.log("\nNodes:");
for (const n of nodes) {
  console.log(
    `  ${n.type === "n8n-nodes-base.webhook" ? "🪝" : n.type === "n8n-nodes-base.switch" ? "🔀" : n.type === "n8n-nodes-base.set" ? "📝" : n.type === "n8n-nodes-base.telegram" ? "📱" : "⬜"} ${n.name} (${n.type})`,
  );
  if (n.webhookId) console.log(`    webhookId: ${n.webhookId}`);
  if (n.type === "n8n-nodes-base.telegram")
    console.log(`    chatId: ${n.parameters?.chatId || "(dynamic)"}`);
}

// Compare with exported version
const exported = JSON.parse(readFileSync("./n8n-workflows/exported-master-workflow.json", "utf8"));
const exportedNodes = exported[0].nodes;

console.log(`\nExported nodes: ${exportedNodes.length}`);
console.log(`Exported connections: ${Object.keys(exported[0].connections || {}).length}`);

// Check for differences
const importedNames = new Set(nodes.map((n: any) => n.name));
const exportedNames = new Set(exportedNodes.map((n: any) => n.name));

const missing = [...exportedNames].filter((x) => !importedNames.has(x));
const extra = [...importedNames].filter((x) => !exportedNames.has(x));

if (missing.length) console.log(`\nMissing from DB: ${missing.join(", ")}`);
if (extra.length) console.log(`\nExtra in DB: ${extra.join(", ")}`);
if (!missing.length && !extra.length) console.log("\n✅ DB matches exported workflow (node names)");

db.close();
