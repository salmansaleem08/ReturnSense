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
        supabaseAdmin
          .from("buyers")
          .select("*", { count: "exact", head: true })
          .eq("seller_id", user.id)
          .is("deleted_at", null),
        supabaseAdmin
          .from("buyers")
          .select("final_trust_score,final_risk_level,outcome")
          .eq("seller_id", user.id)
          .is("deleted_at", null),
        supabaseAdmin
          .from("buyers")
          .select("*", { count: "exact", head: true })
          .eq("seller_id", user.id)
          .is("deleted_at", null)
          .eq("outcome", "fake"),
        supabaseAdmin
          .from("buyers")
          .select("*", { count: "exact", head: true })
          .eq("seller_id", user.id)
          .is("deleted_at", null)
          .in("final_risk_level", ["high", "critical"]),
        supabaseAdmin
          .from("buyers")
          .select("*", { count: "exact", head: true })
          .eq("seller_id", user.id)
          .is("deleted_at", null)
          .eq("outcome", "pending"),
        checkQuota(user.id, user.email)
      ]);

    const safeRows = scoreRows ?? [];
    const scores = safeRows
      .map((row) => row.final_trust_score)
      .filter((score): score is number => typeof score === "number");
    const avgTrustScore = scores.length ? Math.round(scores.reduce((sum, current) => sum + current, 0) / scores.length) : 0;

    const delivered = safeRows.filter((row) => row.outcome === "delivered").length;
    const returned = safeRows.filter((row) => row.outcome === "returned").length;
    const returnRate = delivered + returned > 0 ? Math.round((returned / (delivered + returned)) * 100) : 0;

    const since7 = new Date();
    since7.setDate(since7.getDate() - 6);
    since7.setHours(0, 0, 0, 0);
    const { data: trendRows } = await supabaseAdmin
      .from("buyers")
      .select("created_at, final_trust_score, final_risk_level")
      .eq("seller_id", user.id)
      .is("deleted_at", null)
      .gte("created_at", since7.toISOString());

    const riskBucketsByDay: Record<string, { sum: number; n: number; high: number }> = {};
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      d.setHours(0, 0, 0, 0);
      riskBucketsByDay[d.toISOString().slice(0, 10)] = { sum: 0, n: 0, high: 0 };
    }
    for (const row of trendRows ?? []) {
      const day = new Date(String(row.created_at)).toISOString().slice(0, 10);
      if (!(day in riskBucketsByDay)) continue;
      const sc = row.final_trust_score;
      const score = typeof sc === "number" ? sc : 0;
      riskBucketsByDay[day].sum += score;
      riskBucketsByDay[day].n += 1;
      const rk = String(row.final_risk_level ?? "").toLowerCase();
      if (rk === "high" || rk === "critical") {
        riskBucketsByDay[day].high += 1;
      }
    }
    const risk_trend_7d = Object.entries(riskBucketsByDay).map(([fullDate, v]) => ({
      day: fullDate.slice(5),
      fullDate,
      avg_trust: v.n > 0 ? Math.round(v.sum / v.n) : null,
      high_risk_count: v.high,
      analyses_count: v.n
    }));

    const riskBuckets = { low: 0, medium: 0, high: 0, critical: 0 };
    for (const row of safeRows) {
      const k = ((row.final_risk_level as string) || "critical").toLowerCase();
      if (k in riskBuckets) riskBuckets[k as keyof typeof riskBuckets] += 1;
    }

    return apiSuccess(
      {
        total_analyses: totalAnalyses ?? 0,
        avg_trust_score: avgTrustScore,
        return_rate: returnRate,
        scams_detected: scams ?? 0,
        high_risk_count: highRisk ?? 0,
        pending_count: pending ?? 0,
        analyses_used: quota.used,
        analyses_limit: quota.limit,
        delivered_count: delivered,
        returned_count: returned,
        risk_distribution: riskBuckets,
        risk_trend_7d
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch stats";
    return apiError(message, 500);
  }
});
