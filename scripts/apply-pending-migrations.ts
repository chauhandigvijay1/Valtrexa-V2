// Apply migrations by creating exec_sql function first via REST, then using it
// The Supabase project ref is: ubpjhunogqddyatqdjva
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

async function applyViaInsert() {
  console.log("Strategy 1: Insert dummy rows to test connection...");
  
  // Test: can we query tailored_resumes columns?
  const { data, error } = await supabase
    .from("tailored_resumes")
    .select("id, storage_path")
    .limit(1);
  
  if (error) {
    console.error("Cannot query tailored_resumes:", error.message);
    return;
  }
  console.log("✓ tailored_resumes accessible, row count:", data.length);
  
  // Check if pdf_storage_path already exists by trying to select it
  const { error: colError } = await supabase
    .from("tailored_resumes")
    .select("pdf_storage_path")
    .limit(1);
  
  if (!colError) {
    console.log("✓ pdf_storage_path column already exists in live DB");
  } else {
    console.error("✗ pdf_storage_path NOT in live DB:", colError.message);
    console.log("⚠ You need to apply the migration via Supabase Dashboard SQL Editor:");
    console.log("  ALTER TABLE public.tailored_resumes ADD COLUMN IF NOT EXISTS pdf_storage_path text;");
  }
  
  // Check if follow_ups table exists
  const { error: fuError } = await supabase
    .from("follow_ups")
    .select("id")
    .limit(1);
  
  if (!fuError) {
    console.log("✓ follow_ups table already exists in live DB");
  } else {
    console.error("✗ follow_ups table NOT in live DB:", fuError.message);
    console.log("⚠ You need to apply the migration via Supabase Dashboard SQL Editor.");
    console.log("  See: supabase/migrations/20260604000001_follow_ups.sql");
  }
}

applyViaInsert().catch(console.error);
