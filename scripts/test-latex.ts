import http from "node:http";
import https from "node:https";
import fs from "node:fs/promises";
import { URL } from "node:url";

async function compile(texContent: string): Promise<Buffer> {
  const url = new URL("https://latexonline.cc/compile");
  url.searchParams.set("text", texContent);
  url.searchParams.set("command", "pdflatex");

  return new Promise((resolve, reject) => {
    https.get(url.toString(), (res) => {
      if (res.statusCode !== 200 && res.statusCode !== 302) {
        let errData = "";
        res.on("data", (c) => (errData += c));
        res.on("end", () => reject(new Error(`Status ${res.statusCode}: ${errData}`)));
        return;
      }
      
      // Follow redirects if any
      if (res.statusCode === 302 && res.headers.location) {
        https.get(res.headers.location, (res2) => {
          const chunks: Buffer[] = [];
          res2.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
          res2.on("end", () => resolve(Buffer.concat(chunks)));
        }).on("error", reject);
        return;
      }

      const chunks: Buffer[] = [];
      res.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    }).on("error", reject);
  });
}

async function main() {
  const tex = `\\documentclass{article}\\begin{document}Hello World\\end{document}`;
  try {
    console.log("Compiling...");
    const pdf = await compile(tex);
    console.log("Compiled PDF size:", pdf.length, "bytes");
    await fs.writeFile("test-latexonline.pdf", pdf);
    console.log("Success.");
  } catch(e) {
    console.error("Failed:", e);
  }
}
main();
