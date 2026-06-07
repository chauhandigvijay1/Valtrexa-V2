const fs = require("fs");
let c = fs.readFileSync("src/routes/_authenticated/resumes.tsx", "utf8");

if (!c.includes("function PdfPreview")) {
  const comp = `
function PdfPreview({ path, bucket }: { path: string; bucket: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    supabase.storage.from(bucket).createSignedUrl(path, 60 * 10).then(({ data }) => {
      if (data?.signedUrl) setUrl(data.signedUrl);
    });
  }, [path, bucket]);
  if (!url) return <div className="p-4 text-center text-sm text-muted-foreground border rounded-lg">Loading preview...</div>;
  return <iframe src={url} className="w-full h-[600px] border rounded-lg" title="PDF Preview" />;
}
`;
  c = c + comp;

  c = c.replace(
    '<div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tailored resume version</div>\n                              <Textarea rows={14} readOnly value={resume.latestTailored.optimized_resume} />',
    `{resume.latestTailored.pdf_storage_path ? (
                                <div className="space-y-2">
                                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">PDF Preview</div>
                                  <PdfPreview path={resume.latestTailored.pdf_storage_path} bucket="tailored-resumes" />
                                </div>
                              ) : (
                                <>
                                  <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Tailored resume version</div>
                                  <Textarea rows={14} readOnly value={resume.latestTailored.optimized_resume} />
                                </>
                              )}`,
  );

  c = c.replace(
    /import \{ useMemo, useRef, useState \} from "react";/,
    'import { useMemo, useRef, useState, useEffect } from "react";',
  );

  fs.writeFileSync("src/routes/_authenticated/resumes.tsx", c);
}
