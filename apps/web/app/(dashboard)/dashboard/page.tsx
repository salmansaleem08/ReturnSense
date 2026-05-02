"use client";

import { useEffect, useMemo, useState } from "react";
import { StatsCard } from "@/components/stats-card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { TrustScoreBadge } from "@/components/buyers/trust-score-badge";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function DashboardPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [stats, setStats] = useState<any>(null);
  const [recent, setRecent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) {
        setLoading(false);
        return;
      }

      const [statsRes, recentRes] = await Promise.all([
        fetch("/api/stats", { headers: { Authorization: `Bearer ${token}` } }),
        supabase
          .from("buyers")
          .select("id,instagram_username,final_trust_score,final_risk_level,outcome,created_at")
          .order("created_at", { ascending: false })
          .limit(5)
      ]);

      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
      setRecent(recentRes.data ?? []);
      setLoading(false);
    }
    load();
  }, [supabase]);

  return (
    <div className="space-y-6" style={{ color: "var(--ig-text-primary, #262626)" }}>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {loading ? (
          <>
            {Array.from({ length: 6 }).map((_, idx) => (
              <Skeleton key={idx} className="h-28" />
            ))}
          </>
        ) : (
          <>
            <StatsCard title="Total Analyses" value={`${stats?.total_analyses ?? 0}`} helper="This month" />
            <StatsCard title="Avg Trust Score" value={`${stats?.avg_trust_score ?? 0}`} helper="Across analyzed buyers" />
            <StatsCard title="Return Rate" value={`${stats?.return_rate ?? 0}%`} helper="Returned over delivered + returned" />
            <StatsCard title="Scams Detected" value={`${stats?.scams_detected ?? 0}`} />
            <StatsCard title="High Risk Orders" value={`${stats?.high_risk_count ?? 0}`} />
            <StatsCard title="Pending Outcomes" value={`${stats?.pending_count ?? 0}`} />
          </>
        )}
      </section>

      <section
        className="rounded-[8px] p-4"
        style={{
          background: "var(--ig-surface, #fff)",
          border: "1px solid #DBDBDB",
          boxShadow: "none"
        }}
      >
        <h2 className="mb-4 text-sm font-semibold" style={{ color: "var(--ig-text-primary, #262626)" }}>
          Recent buyer analyses
        </h2>
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
            {recent.length ? (
              recent.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>@{row.instagram_username}</TableCell>
                  <TableCell><TrustScoreBadge score={row.final_trust_score} /></TableCell>
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
                <TableCell colSpan={4} className="text-center text-muted-foreground">
                  No analyses yet.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>

      <section className="rounded-[var(--radius-md)] border border-border bg-card p-5">
        <h2 className="mb-3 text-base font-semibold text-foreground">How to use the extension</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-foreground/90">
          <li>Open Instagram DM and click <strong>Analyze Buyer</strong>.</li>
          <li>Add phone and address details in the side panel.</li>
          <li>Run analysis and review trust score before confirming COD order.</li>
        </ol>
      </section>
    </div>
  );
}
