import { supabaseAdmin } from "./supabase.js";

export type ApiUser = {
  id: string;
  email?: string;
};

export async function requireApiUser(request: Request): Promise<ApiUser> {
  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Response(JSON.stringify({ error: "Missing bearer token." }), { status: 401 });
  }

  const token = authHeader.slice("Bearer ".length).trim();
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    throw new Response(JSON.stringify({ error: "Invalid bearer token." }), { status: 401 });
  }

  return { id: data.user.id, email: data.user.email };
}
