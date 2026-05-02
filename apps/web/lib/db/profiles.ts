import { supabaseAdmin } from "@/lib/supabase/server";

/** Used when auth exists but no profiles row (pre-trigger users or failed trigger). */
const PLACEHOLDER_EMAIL_HOST = "returnsense.placeholder";

export async function ensureProfile(userId: string, email?: string | null) {
  const { data: existing, error: selErr } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .maybeSingle();
  if (selErr) throw new Error(selErr.message);
  if (existing) return existing;

  const safeEmail =
    email?.trim() && email.includes("@") ? email.trim() : `${userId}@${PLACEHOLDER_EMAIL_HOST}`;
  const { data: created, error: insErr } = await supabaseAdmin
    .from("profiles")
    .insert({ id: userId, email: safeEmail })
    .select("*")
    .maybeSingle();
  if (insErr) throw new Error(insErr.message);
  if (!created) throw new Error("Failed to create profile");
  return created;
}

export async function getProfile(userId: string, email?: string | null) {
  return ensureProfile(userId, email);
}

export async function incrementUsage(userId: string, email?: string | null) {
  const profile = await ensureProfile(userId, email);
  const nextUsed = (profile.analyses_used ?? 0) + 1;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({ analyses_used: nextUsed })
    .eq("id", userId)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Failed to update usage (profile missing after ensure)");
  return data;
}

export async function checkQuota(userId: string, email?: string | null) {
  const profile = await ensureProfile(userId, email);
  const used = profile.analyses_used ?? 0;
  const limit = profile.analyses_limit ?? 0;
  return { allowed: used < limit, used, limit };
}
