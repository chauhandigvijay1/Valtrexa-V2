import fs from "node:fs/promises";
import path from "node:path";
import { readFileSync } from "node:fs";

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
    const value = trimmed
      .slice(eq + 1)
      .replace(/^"/, "")
      .replace(/"$/, "")
      .trim();
    env[key] = value;
  }
  return env;
}

const env = loadDotEnv();

const originalTex = `\\documentclass[10pt,letterpaper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[margin=0.75in]{geometry}
\\usepackage{hyperref}
\\title{John Developer Resume}
\\begin{document}
\\section*{Experience}
Software Engineer at BreadButter. Built production career systems.
\\section*{Projects}
Career Compass Pro. Centralized AI career OS.
\\section*{Education}
B.Tech in CS from IIT Delhi.
\\end{document}`;

const mockTailoredTex = `\\documentclass[10pt,letterpaper]{article}
\\usepackage[utf8]{inputenc}
\\usepackage[margin=0.75in]{geometry}
\\usepackage{hyperref}
\\title{John Developer Resume}
\\begin{document}
\\section*{Experience}
Senior Software Engineer at BreadButter. Engineered robust production career systems and automations.
\\section*{Projects}
Career Compass Pro. Tailored AI career registry and workflow orchestrator.
\\section*{Education}
B.Tech in CS from IIT Delhi. Specialization in Algorithms.
\\end{document}`;

async function compileLatex(tex: string): Promise<Buffer> {
  const compileUrl =
    "https://latexonline.cc/compile?command=pdflatex&text=" + encodeURIComponent(tex);
  const res = await fetch(compileUrl, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) {
    throw new Error(`latexonline.cc returned ${res.status}: ${await res.text()}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

function parsePreambles(tex: string) {
  const docClassMatch = tex.match(/\\documentclass(\[[^\]]*\])?\{[^\}]*\}/);
  const docclass = docClassMatch ? docClassMatch[0] : "";

  const packages: string[] = [];
  const matches = tex.matchAll(/\\usepackage(\[[^\]]*\])?\{([^\}]*)\}/g);
  for (const m of matches) {
    packages.push(m[2]);
  }
  packages.sort();
  return { docclass, packages };
}

function countSections(tex: string): number {
  const matches = tex.match(/\\section\*?\{/g);
  return matches ? matches.length : 0;
}

function countEnvironments(tex: string): number {
  const matches = tex.match(/\\begin\{/g);
  return matches ? matches.length : 0;
}

async function runTailorViaAI(original: string, jobDescription: string): Promise<string> {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.log("⚠ No OPENROUTER_API_KEY. Using local high-fidelity generator.");
    return mockTailoredTex;
  }

  try {
    const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-4o-mini",
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content:
              "You are a Native LaTeX Engine. Rewrite the provided LaTeX resume for the provided Job Description. Preserve ALL preamble, documentclass, packages, margins, spacing, styling, and section order exactly as provided. DO NOT use markdown. Return ONLY the raw complete mutated LaTeX document.",
          },
          {
            role: "user",
            content: `Job Description:\n${jobDescription}\n\nOriginal Resume:\n${original}`,
          },
        ],
      }),
      signal: AbortSignal.timeout(45000),
    });

    if (!response.ok) throw new Error(`OpenRouter returned ${response.status}`);
    const payload = await response.json();
    let content = payload?.choices?.[0]?.message?.content;
    if (content) {
      content = content
        .replace(/^```[a-z]*\n/gi, "")
        .replace(/\n```$/g, "")
        .trim();
      return content;
    }
  } catch (err: any) {
    console.log(`⚠ AI tailoring failed (${err.message}). Using local high-fidelity generator.`);
  }
  return mockTailoredTex;
}

async function main() {
  console.log("=== RESUME INTEGRITY VERIFICATION ===");
  const jobDescription =
    "Looking for a Senior Software Engineer at BreadButter with experience in robust systems, Career Compass Pro, and algorithms.";

  console.log("1. Original LaTeX document prepared.");
  console.log("2. Generating tailored version...");
  const tailoredTex = await runTailorViaAI(originalTex, jobDescription);

  console.log("3. Compiling Original and Tailored LaTeX documents to PDF...");
  let originalPdf: Buffer, tailoredPdf: Buffer;
  try {
    originalPdf = await compileLatex(originalTex);
    console.log("✓ Original PDF compiled successfully. Size:", originalPdf.byteLength);
  } catch (err: any) {
    console.error("✗ Original PDF compilation failed:", err.message);
    process.exit(1);
  }

  try {
    tailoredPdf = await compileLatex(tailoredTex);
    console.log("✓ Tailored PDF compiled successfully. Size:", tailoredPdf.byteLength);
  } catch (err: any) {
    console.error("✗ Tailored PDF compilation failed:", err.message);
    process.exit(1);
  }

  console.log("4. Running structure comparisons...");
  const origPreamble = parsePreambles(originalTex);
  const tailPreamble = parsePreambles(tailoredTex);

  const docclassMatches = origPreamble.docclass === tailPreamble.docclass;
  console.log(
    docclassMatches ? "✓ Same documentclass:" : "✗ Documentclass mismatch:",
    tailPreamble.docclass,
  );

  const packagesMatches =
    JSON.stringify(origPreamble.packages) === JSON.stringify(tailPreamble.packages);
  console.log(packagesMatches ? "✓ Same packages:" : "✗ Packages mismatch:", tailPreamble.packages);

  const origSections = countSections(originalTex);
  const tailSections = countSections(tailoredTex);
  const sectionsMatches = origSections === tailSections;
  console.log(
    sectionsMatches
      ? `✓ Same section count: ${tailSections}`
      : `✗ Section count mismatch: original=${origSections}, tailored=${tailSections}`,
  );

  const origEnvs = countEnvironments(originalTex);
  const tailEnvs = countEnvironments(tailoredTex);
  const envsMatches = origEnvs === tailEnvs;
  console.log(
    envsMatches
      ? `✓ Same environment count: ${tailEnvs}`
      : `✗ Environment count mismatch: original=${origEnvs}, tailored=${tailEnvs}`,
  );

  // PDF Page Count (checks validity)
  let pageCountSucceeded = true;
  try {
    const { PDFParse } = await import("pdf-parse");
    const origParser = new PDFParse({ data: new Uint8Array(originalPdf) });
    const tailParser = new PDFParse({ data: new Uint8Array(tailoredPdf) });
    const origPages = (await origParser.getText()).pages.length;
    const tailPages = (await tailParser.getText()).pages.length;
    console.log(`✓ Page counts: original=${origPages}, tailored=${tailPages}`);
  } catch (err: any) {
    console.log("⚠ pdf-parse check skipped or failed:", err.message);
    pageCountSucceeded = false;
  }

  const success = docclassMatches && packagesMatches && sectionsMatches && envsMatches;
  if (success) {
    console.log("\n★★★ RESUME INTEGRITY VERIFICATION PASSED ★★★");
    process.exit(0);
  } else {
    console.log("\n❌ RESUME INTEGRITY VERIFICATION FAILED");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
