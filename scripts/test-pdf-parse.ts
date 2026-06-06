import { PDFParse } from "pdf-parse";
import { readFileSync } from "node:fs";

async function main() {
  try {
    const buffer = readFileSync("test-latexonline.pdf");
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    const doc = await parser.getInfo();
    const text = await parser.getText();
    console.log("PDF parsed successfully!");
    console.log("Pages:", text.pages.length);
    console.log("concatenated length:", text.text.length);
  } catch (e) {
    console.error("Failed:", e);
  }
}
main();
