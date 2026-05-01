import { supabaseAdmin } from "@/lib/supabase/server";

export async function getProfile(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("*")
    .eq("id", userId)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function incrementUsage(userId: string) {
  const profile = await getProfile(userId);
  const nextUsed = (profile.analyses_used ?? 0) + 1;

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .update({ analyses_used: nextUsed })
    .eq("id", userId)
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function checkQuota(userId: string) {
  const profile = await getProfile(userId);
  const used = profile.analyses_used ?? 0;
  const limit = profile.analyses_limit ?? 0;
  return { allowed: used < limit, used, limit };
}
