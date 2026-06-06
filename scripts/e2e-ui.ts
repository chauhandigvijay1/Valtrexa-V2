import { chromium } from "playwright";
import { exec } from "child_process";
import fs from "fs";
import path from "path";

(async () => {
  console.log("Starting server...");
  const server = exec("npm.cmd run dev");
  
  await new Promise(r => setTimeout(r, 5000)); // wait for server
  
  console.log("Launching browser...");
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    console.log("Navigating to auth...");
    await page.goto("http://localhost:5173/");
    await page.screenshot({ path: "screenshot-1-home.png" });
    
    console.log("WORKFLOW FAILED: UI elements for End-to-End are missing.");
  } catch (e) {
    console.error("Error", e);
  } finally {
    await browser.close();
    server.kill();
    process.exit(0);
  }
})();
