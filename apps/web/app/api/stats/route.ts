import { createClient } from "@supabase/supabase-js";

import { checkQuota } from "@/lib/db/profiles";
import { getSupabasePublicKey, getSupabaseUrl } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/server";

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    const supabase = createClient(getSupabaseUrl(), getSupabasePublicKey());
    const {
      data: { user }
    } = await supabase.auth.getUser(token);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    const [{ count: totalAnalyses = 0 }, { data: scoreRows = [] }, { count: scams = 0 }, { count: highRisk = 0 }, { count: pending = 0 }, quota] =
      await Promise.all([
        supabaseAdmin.from("buyers").select("*", { count: "exact", head: true }).eq("seller_id", user.id),
        supabaseAdmin.from("buyers").select("final_trust_score,outcome").eq("seller_id", user.id),
        supabaseAdmin.from("buyers").select("*", { count: "exact", head: true }).eq("seller_id", user.id).eq("outcome", "fake"),
        supabaseAdmin
          .from("buyers")
          .select("*", { count: "exact", head: true })
          .eq("seller_id", user.id)
          .in("final_risk_level", ["high", "critical"]),
        supabaseAdmin.from("buyers").select("*", { count: "exact", head: true }).eq("seller_id", user.id).eq("outcome", "pending"),
        checkQuota(user.id)
      ]);

    const safeRows = scoreRows ?? [];
    const scores = safeRows
      .map((row) => row.final_trust_score)
      .filter((score): score is number => typeof score === "number");
    const avgTrustScore = scores.length ? Math.round(scores.reduce((sum, current) => sum + current, 0) / scores.length) : 0;

    const delivered = safeRows.filter((row) => row.outcome === "delivered").length;
    const returned = safeRows.filter((row) => row.outcome === "returned").length;
    const returnRate = delivered + returned > 0 ? Math.round((returned / (delivered + returned)) * 100) : 0;

    return Response.json(
      {
        total_analyses: totalAnalyses ?? 0,
        avg_trust_score: avgTrustScore,
        return_rate: returnRate,
        scams_detected: scams ?? 0,
        high_risk_count: highRisk ?? 0,
        pending_count: pending ?? 0,
        analyses_used: quota.used,
        analyses_limit: quota.limit
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch stats";
    return Response.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}
