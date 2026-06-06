async function handleResumeTailor(request: Request) {
  if (request.method !== "POST") return methodNotAllowed(["POST"]);
  const user = await requireApiUser(request);
  const body = await readJson<ResumeAnalysisBody>(request);
  const versionData = await getResumeVersion(user.id, body.resumeId, body.resumeVersionId);

  if (!versionData) {
    return json({ error: "Resume version not found." }, { status: 404 });
  }

  const normalizedVersion = normalizeResumeVersion(versionData);
  const sourceResume = normalizedVersion.parsed_text || normalizedVersion.content;
  if (!sourceResume) {
    return json({ error: "Resume content unavailable." }, { status: 400 });
  }

  const isLatex = normalizedVersion.file_type === "application/x-tex" || normalizedVersion.file_name?.endsWith(".tex");
  const timestamp = Date.now();

  let storagePath = "";
  let finalAtsFriendly = "";
  let finalOptimized = "N/A";
  let finalMissingSkills: string[] = [];

  if (isLatex) {
    // 1. NATIVE LATEX WORKFLOW
    const { data: texFile } = await supabaseAdmin.storage.from("resumes").download(normalizedVersion.storage_path);
    if (!texFile) return json({ error: "Original .tex file not found in storage." }, { status: 404 });
    const texContent = await texFile.text();

    const mutatedTexResult = await withTimeout(
      callOpenRouterText([
        { role: "system", content: "You are a Native LaTeX Engine. Rewrite the provided LaTeX resume for the provided Job Description. Preserve ALL preamble, documentclass, packages, margins, spacing, styling, and section order exactly as provided. DO NOT use markdown. DO NOT invent experience. Return ONLY the raw complete mutated LaTeX document." },
        { role: "user", content: `Job Description:\n${body.jobDescription.slice(0, 30000)}\n\nOriginal Resume:\n${texContent}` }
      ], { userId: user.id }),
      55000,
      "Tailored latex generation"
    ).catch(() => ({ content: texContent }));

    let mutatedTex = (mutatedTexResult as any).content || texContent;
    // Strip markdown formatting if the model incorrectly wrapped it
    mutatedTex = mutatedTex.replace(/^```[a-z]*\n/gi, "").replace(/\n```$/g, "");
    
    // Save .tex
    const texPath = `${user.id}/${body.resumeId}/tailored-${timestamp}.tex`;
    await supabaseAdmin.storage.from("tailored-resumes").upload(texPath, Buffer.from(mutatedTex, "utf-8"), {
      contentType: "application/x-tex",
      upsert: false,
    });
    
    storagePath = texPath;
    finalAtsFriendly = mutatedTex; // Technically the raw .tex

    // 2. COMPILE TO PDF NATIVELY
    try {
      const url = new URL("https://latexonline.cc/compile");
      url.searchParams.set("text", mutatedTex);
      url.searchParams.set("command", "pdflatex");
      const res = await fetch(url.toString(), { redirect: "follow" });
      if (res.ok) {
        const pdfBuffer = await res.arrayBuffer();
        const pdfPath = `${user.id}/${body.resumeId}/tailored-${timestamp}.pdf`;
        await supabaseAdmin.storage.from("tailored-resumes").upload(pdfPath, Buffer.from(pdfBuffer), {
          contentType: "application/pdf",
          upsert: false,
        });
      } else {
        console.error("PDF Compilation failed", res.status, await res.text());
      }
    } catch (e) {
      console.error("PDF Compilation error", e);
    }
  } else {
    // 3. LEGACY MARKDOWN WORKFLOW
    const tailored = await withTimeout(
      callOpenRouterJson<TailoredResume>(
      [
        {
          role: "system",
          content:
            "Rewrite the provided resume for the job description. Preserve truthfulness. Do not invent experience. Return strict JSON only.",
        },
        {
          role: "user",
          content: `Resume:\n${sourceResume.slice(0, 60000)}\n\nJob Description:\n${body.jobDescription.slice(0, 30000)}`,
        },
      ],
      "tailored_resume",
      tailoredSchema,
      { userId: user.id },
      ),
      45000,
      "Tailored resume generation",
    ).catch(() => ({
      data: fallbackTailoredResume(sourceResume, body.jobDescription),
      model: "local-fallback:tailored-resume",
      usage: null,
      source: "env" as const,
    }));
    const normalizedTailored = normalizeTailoredResumePayload(tailored.data, sourceResume, body.jobDescription);
    
    finalOptimized = normalizedTailored.optimizedResume;
    finalAtsFriendly = normalizedTailored.atsFriendlyResume;
    finalMissingSkills = normalizedTailored.missingSkills;
    
    storagePath = `${user.id}/${body.resumeId}/tailored-${timestamp}.md`;
    await supabaseAdmin.storage.from("tailored-resumes").upload(storagePath, Buffer.from(finalAtsFriendly, "utf-8"), {
        contentType: "text/markdown; charset=utf-8",
        upsert: false,
    });
  }

  const insert = await supabaseAdmin
    .from("tailored_resumes")
    .insert({
      user_id: user.id,
      resume_id: body.resumeId,
      resume_version_id: versionData.id,
      job_id: body.jobId ?? null,
      job_description: body.jobDescription,
      optimized_resume: finalOptimized,
      ats_friendly_resume: finalAtsFriendly,
      missing_skills: finalMissingSkills,
      storage_path: storagePath,
    })
    .select("*")
    .single();

  if (insert.error || !insert.data) {
    return json({ error: insert.error?.message ?? "Failed to store tailored resume." }, { status: 400 });
  }

  await emitWorkflowEvent({
    userId: user.id,
    eventType: "resume_tailored",
    entityType: "tailored_resumes",
    entityId: insert.data.id,
    payload: { resumeId: body.resumeId, resumeVersionId: versionData.id, jobId: body.jobId ?? null, storagePath },
  });

  return json(insert.data);
}
