const fs = require('fs');
let c = fs.readFileSync('src/routes/_authenticated/resumes.tsx', 'utf8');

c = c.replace(
  'const source = resume.latestTailored?.pdf_storage_path\n    ? { bucket: "tailored-resumes", path: resume.latestTailored.pdf_storage_path }\n    : resume.latestTailored?.storage_path\n      ? { bucket: "tailored-resumes", path: resume.latestTailored.storage_path }',
  'const path = resume.latestTailored?.storage_path; const isTex = path && path.endsWith(".tex"); const source = path ? { bucket: "tailored-resumes", path: isTex ? path.replace(".tex", ".pdf") : path }'
);

c = c.replace(
  '{resume.latestTailored.pdf_storage_path ? (\n                                <div className="space-y-2">\n                                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">PDF Preview</div>\n                                  <PdfPreview path={resume.latestTailored.pdf_storage_path} bucket="tailored-resumes" />\n                                </div>\n                              ) : (',
  '{resume.latestTailored.storage_path?.endsWith(".tex") ? (\n                                <div className="space-y-2">\n                                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">PDF Preview</div>\n                                  <PdfPreview path={resume.latestTailored.storage_path.replace(".tex", ".pdf")} bucket="tailored-resumes" />\n                                </div>\n                              ) : ('
);

fs.writeFileSync('src/routes/_authenticated/resumes.tsx', c);
