import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { StatsCard } from "@/components/stats-card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { supabaseAdmin } from "@/lib/supabase/server";

function asNumber(value: number | null | undefined, fallback = 0) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

export default async function DashboardPage() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {}
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [{ count: totalAnalyses = 0 }, { data: scoreRows }, { count: scams = 0 }, { count: highRisk = 0 }, { count: pending = 0 }, { data: recent }] =
    await Promise.all([
      supabaseAdmin
        .from("buyers")
        .select("*", { count: "exact", head: true })
        .eq("seller_id", user.id),
      supabaseAdmin
        .from("buyers")
        .select("final_trust_score,outcome")
        .eq("seller_id", user.id),
      supabaseAdmin
        .from("buyers")
        .select("*", { count: "exact", head: true })
        .eq("seller_id", user.id)
        .eq("outcome", "fake"),
      supabaseAdmin
        .from("buyers")
        .select("*", { count: "exact", head: true })
        .eq("seller_id", user.id)
        .in("final_risk_level", ["high", "critical"]),
      supabaseAdmin
        .from("buyers")
        .select("*", { count: "exact", head: true })
        .eq("seller_id", user.id)
        .eq("outcome", "pending"),
      supabaseAdmin
        .from("buyers")
        .select("id,instagram_username,final_trust_score,final_risk_level,outcome,created_at")
        .eq("seller_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5)
    ]);

  const safeScoreRows = scoreRows ?? [];
  const safeRecent = recent ?? [];

  const validScores = safeScoreRows
    .map((row) => row.final_trust_score)
    .filter((score): score is number => typeof score === "number");
  const avgTrust = validScores.length
    ? Math.round(validScores.reduce((sum, score) => sum + score, 0) / validScores.length)
    : 0;

  const delivered = safeScoreRows.filter((row) => row.outcome === "delivered").length;
  const returned = safeScoreRows.filter((row) => row.outcome === "returned").length;
  const returnRate = delivered + returned > 0 ? Math.round((returned / (delivered + returned)) * 100) : 0;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatsCard title="Total Analyses" value={`${asNumber(totalAnalyses)}`} helper="This month" />
        <StatsCard title="Avg Trust Score" value={`${avgTrust}`} helper="Across analyzed buyers" />
        <StatsCard title="Return Rate" value={`${returnRate}%`} helper="Returned over delivered + returned" />
        <StatsCard title="Scams Detected" value={`${asNumber(scams)}`} />
        <StatsCard title="High Risk Orders" value={`${asNumber(highRisk)}`} />
        <StatsCard title="Pending Outcomes" value={`${asNumber(pending)}`} />
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5">
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Recent Buyer Analyses</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Buyer</TableHead>
              <TableHead>Trust Score</TableHead>
              <TableHead>Risk</TableHead>
              <TableHead>Outcome</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {safeRecent.length ? (
              safeRecent.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>@{row.instagram_username}</TableCell>
                  <TableCell>{row.final_trust_score ?? 0}</TableCell>
                  <TableCell>
                    <Badge variant="secondary" className="capitalize">
                      {row.final_risk_level ?? "unknown"}
                    </Badge>
                  </TableCell>
                  <TableCell className="capitalize">{row.outcome ?? "pending"}</TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={4} className="text-center text-slate-500">
                  No analyses yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
