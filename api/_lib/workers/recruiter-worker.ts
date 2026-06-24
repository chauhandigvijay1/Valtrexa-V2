import {
  discoverContactsViaAI,
  fallbackContacts,
  type DiscoveredContact,
} from "../recruiter-discovery.js";
import { supabaseAdmin } from "../supabase.js";

export type RecruiterPayload = {
  userId: string;
  companyName: string;
  roleTitle?: string;
};

export async function discoverRecruitersInline(
  payload: RecruiterPayload,
): Promise<{ recruiters: any[] }> {
  const [researchRow, existingRow] = await Promise.all([
    supabaseAdmin
      .from("company_research")
      .select("*")
      .eq("user_id", payload.userId)
      .eq("company_name", payload.companyName)
      .maybeSingle(),
    supabaseAdmin
      .from("recruiters")
      .select("*")
      .eq("user_id", payload.userId)
      .ilike("company", payload.companyName),
  ]);

  let contacts: DiscoveredContact[];
  try {
    contacts = await discoverContactsViaAI({
      userId: payload.userId,
      companyName: payload.companyName,
      roleTitle: payload.roleTitle ?? "Software Engineer",
      context: { research: researchRow.data, existingContacts: existingRow.data ?? [] },
    });
    if (!contacts.length)
      contacts = fallbackContacts(payload.companyName, payload.roleTitle ?? "Software Engineer");
  } catch {
    contacts = fallbackContacts(payload.companyName, payload.roleTitle ?? "Software Engineer");
  }

  const inserted: any[] = [];
  for (const c of contacts) {
    const dup = await supabaseAdmin
      .from("recruiters")
      .select("id")
      .eq("user_id", payload.userId)
      .ilike("name", c.name)
      .maybeSingle();
    if (dup.data?.id) continue;
    const ins = await supabaseAdmin
      .from("recruiters")
      .insert({
        user_id: payload.userId,
        name: c.name,
        company: payload.companyName,
        title: c.title,
        role: c.role,
        profile_url: c.profile_url,
        linkedin_url: c.linkedin_url,
        email: c.email,
        email_verified: c.email_verified,
        source: c.source,
        discovered_via: "queue_worker",
        confidence_score: c.confidence_score,
        relevance_score: c.confidence_score,
        notes: `${c.title}\n\n${c.reason}\n\nSearch: ${c.searchQuery}`,
      } as any)
      .select("*")
      .single();
    if (!ins.error && ins.data) inserted.push(ins.data);
  }
  return { recruiters: inserted };
}
