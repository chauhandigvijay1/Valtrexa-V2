const fs = require("fs");
let c = fs.readFileSync("src/routes/_authenticated/resumes.tsx", "utf8");

c = c.replace(
  "storage_path: string | null;\n    job_description: string;",
  "storage_path: string | null;\n    pdf_storage_path?: string | null;\n    job_description: string;",
);

c = c.replace(
  'const source = resume.latestTailored?.storage_path\n    ? { bucket: "tailored-resumes", path: resume.latestTailored.storage_path }',
  'const source = resume.latestTailored?.pdf_storage_path\n    ? { bucket: "tailored-resumes", path: resume.latestTailored.pdf_storage_path }\n    : resume.latestTailored?.storage_path\n      ? { bucket: "tailored-resumes", path: resume.latestTailored.storage_path }',
);

fs.writeFileSync("src/routes/_authenticated/resumes.tsx", c);
