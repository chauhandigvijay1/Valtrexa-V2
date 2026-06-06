import { getProvider } from "../api/_lib/providers.js";

async function testProvider(name: string, config: any) {
  const provider = getProvider(name);
  console.log(`\nTesting Provider: ${name.toUpperCase()}`);
  
  try {
    const jobResult = await provider.importJobs(config);
    console.log(`- Job Import Status: ${jobResult.status}`);
    console.log(`- Jobs Imported Count: ${jobResult.jobs.length}`);
  } catch (err: any) {
    console.log(`- Job Import Failed: ${err.message}`);
  }

  try {
    const recResult = await provider.discoverRecruiters("Supabase", "Software Engineer", config);
    console.log(`- Recruiter Discovery Status: ${recResult.status}`);
    console.log(`- Recruiters Discovered Count: ${recResult.recruiters.length}`);
  } catch (err: any) {
    console.log(`- Recruiter Discovery Failed: ${err.message}`);
  }
}

async function main() {
  console.log("=== PROVIDER ARCHITECTURE VERIFICATION ===");
  
  // Greenhouse (should work out of the box with token or dummy)
  await testProvider("greenhouse", { boardToken: "stripe" });
  
  // Lever (should work out of the box with site or dummy)
  await testProvider("lever", { site: "leverdemo" });
  
  // Ashby (should work with URL)
  await testProvider("ashby", { boardUrl: "https://jobs.ashbyhq.com/assemblyai" });

  // LinkedIn (missing headers/cookies -> READY_FOR_CREDENTIALS)
  await testProvider("linkedin", { searchUrl: "https://www.linkedin.com/jobs/search?keywords=developer" });

  // Naukri (missing headers/cookies -> READY_FOR_CREDENTIALS)
  await testProvider("naukri", { searchUrl: "https://www.naukri.com/developer-jobs" });

  // Wellfound (missing headers/cookies -> READY_FOR_CREDENTIALS)
  await testProvider("wellfound", { searchUrl: "https://wellfound.com/jobs" });

  // Indeed (missing headers/cookies -> READY_FOR_CREDENTIALS)
  await testProvider("indeed", { searchUrl: "https://www.indeed.com/jobs?q=developer" });

  // Instahyre (missing headers/cookies -> READY_FOR_CREDENTIALS)
  await testProvider("instahyre", { searchUrl: "https://www.instahyre.com/jobs" });

  console.log("\n★★★ PROVIDER LAYER VERIFICATION COMPLETED ★★★");
}

main().catch(console.error);
