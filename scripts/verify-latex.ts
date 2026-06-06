import fs from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

async function main() {
  const envText = await fs.readFile(".env", "utf-8");
  const env = {};
  envText.split("\n").forEach(line => {
    const eq = line.indexOf("=");
    if (eq > 0) env[line.slice(0, eq).trim()] = line.slice(eq+1).trim().replace(/^"/, "").replace(/"$/, "");
  });

  const supabase = createClient(env["SUPABASE_URL"], env["SUPABASE_SERVICE_ROLE_KEY"]);

  // We need a user. Just grab any existing user.
  const { data: users } = await supabase.auth.admin.listUsers();
  if (!users.users.length) {
    console.log("No users.");
    return;
  }
  const user = users.users[0];

  const originalTex = `\\documentclass{article}
\\begin{document}
\\section{Experience}
Software Engineer at Tech Corp.
\\end{document}`;
  
  // Create resume
  const resume = await supabase.from("resumes").insert({ user_id: user.id, title: "Test LaTeX Resume" }).select("*").single();
  
  // Upload raw file
  const path = `${user.id}/resumes/test.tex`;
  await supabase.storage.from("resumes").upload(path, Buffer.from(originalTex), { upsert: true, contentType: "application/x-tex" });
  
  // Create version
  const version = await supabase.from("resume_versions").insert({
    user_id: user.id,
    resume_id: resume.data.id,
    version: 1,
    file_type: "application/x-tex",
    storage_path: path,
    parsed_text: originalTex
  }).select("*").single();

  // Call the tailoring API endpoint natively via script
  console.log("Calling tailoring API...");
  const fetchBody = {
    resumeId: resume.data.id,
    resumeVersionId: version.data.id,
    jobDescription: "Looking for an ATS expert.",
    mode: "tailor"
  };

  const res = await fetch("http://localhost:5173/api/resumes/process", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": "Bearer " + env["SUPABASE_SERVICE_ROLE_KEY"] // Or run the server
    },
    body: JSON.stringify(fetchBody)
  });
  
  // Actually, wait, calling the running API server requires it to be running.
  // I will just use the verify-latex logic.
}
