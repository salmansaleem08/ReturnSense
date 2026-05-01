import { apiError, apiSuccess, corsHeaders, withAuth } from "@/lib/api/response";
import { checkQuota } from "@/lib/db/profiles";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export const GET = withAuth(async ({ user }) => {
  try {
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

    return apiSuccess(
      {
        total_analyses: totalAnalyses ?? 0,
        avg_trust_score: avgTrustScore,
        return_rate: returnRate,
        scams_detected: scams ?? 0,
        high_risk_count: highRisk ?? 0,
        pending_count: pending ?? 0,
        analyses_used: quota.used,
        analyses_limit: quota.limit
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch stats";
    return apiError(message, 500);
  }
});
