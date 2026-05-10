"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { DashboardHero } from "@/components/dashboard/DashboardHero";
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

type StatsPayload = {
  total_analyses?: number;
  avg_trust_score?: number;
  return_rate?: number;
  scams_detected?: number;
  high_risk_count?: number;
  pending_count?: number;
  analyses_used?: number;
  analyses_limit?: number;
  delivered_count?: number;
  returned_count?: number;
  risk_distribution?: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
};

export default function DashboardPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [stats, setStats] = useState<StatsPayload | null>(null);
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
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(8)
      ]);

      if (statsRes.ok) {
        setStats((await statsRes.json()) as StatsPayload);
      }
      setRecent(recentRes.data ?? []);
      setLoading(false);
    }
    load();
  }, [supabase]);

  const riskDist = stats?.risk_distribution;
  const portfolioBars =
    riskDist != null
      ? [
          { level: "Low", count: riskDist.low, fill: "var(--chart-2)" },
          { level: "Medium", count: riskDist.medium, fill: "var(--chart-4)" },
          { level: "High", count: riskDist.high, fill: "var(--chart-1)" },
          { level: "Critical", count: riskDist.critical, fill: "var(--chart-5)" }
        ]
      : [];
  const portfolioTotal = portfolioBars.reduce((s, r) => s + r.count, 0);

  return (
    <div className="space-y-6 text-foreground">
      <DashboardHero />

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 rs-stagger">
        {loading ? (
          <>
            {Array.from({ length: 6 }).map((_, idx) => (
              <Skeleton key={idx} className="h-28 rounded-[var(--radius-md)]" />
            ))}
          </>
        ) : (
          <>
            <StatsCard title="Total analyses" value={`${stats?.total_analyses ?? 0}`} helper="All time" />
            <StatsCard
              title="Avg trust score"
              value={`${stats?.avg_trust_score ?? 0}`}
              helper="Across buyers"
            />
            <StatsCard
              title="Return rate"
              value={`${stats?.return_rate ?? 0}%`}
              helper="Returned ÷ (delivered + returned)"
            />
            <StatsCard
              title="Scams flagged"
              value={`${stats?.scams_detected ?? 0}`}
              helper="Outcome = fake"
            />
            <StatsCard title="High / critical risk" value={`${stats?.high_risk_count ?? 0}`} />
            <StatsCard
              title="Quota"
              value={`${stats?.analyses_used ?? 0} / ${stats?.analyses_limit ?? 20}`}
              helper="This month"
            />
          </>
        )}
      </section>

      <section className="motion-safe:animate-[rs-fade-in_0.5s_ease-out] rounded-xl border border-border bg-card p-4">
        <h2 className="mb-1 text-sm font-semibold text-foreground">Risk portfolio</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          All-time count of analyses by final risk level. Totals stay meaningful even when you haven&apos;t run new analyses
          recently.
        </p>
        {loading ? (
          <Skeleton className="h-[200px] w-full rounded-[var(--radius-md)]" />
        ) : portfolioTotal === 0 ? (
          <p className="rounded-lg border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-sm text-muted-foreground">
            No analyses yet — levels will appear here after your first buyer reports.
          </p>
        ) : (
          <div className="h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={portfolioBars} margin={{ top: 8, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis
                  dataKey="level"
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={{ stroke: "var(--border)" }}
                />
                <YAxis
                  allowDecimals={false}
                  width={36}
                  tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                  axisLine={{ stroke: "var(--border)" }}
                  label={{
                    value: "Analyses",
                    angle: -90,
                    position: "insideLeft",
                    fill: "var(--muted-foreground)",
                    fontSize: 10
                  }}
                />
                <Tooltip
                  cursor={{ fill: "var(--muted)", opacity: 0.15 }}
                  contentStyle={{
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    fontSize: 12,
                    background: "var(--card)"
                  }}
                  formatter={(value) => [`${value ?? 0}`, "Analyses"]}
                />
                <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={56}>
                  {portfolioBars.map((entry) => (
                    <Cell key={`cell-${entry.level}`} fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="motion-safe:animate-[rs-fade-in_0.55s_ease-out] rounded-xl border border-border bg-card p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-foreground">Recent buyer analyses</h2>
          <Link href="/dashboard/buyers" className="text-xs font-semibold text-primary">
            View all
          </Link>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Buyer</TableHead>
              <TableHead>Trust</TableHead>
              <TableHead>Risk</TableHead>
              <TableHead>Outcome</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {recent.length ? (
              recent.map((row) => (
                <TableRow key={row.id} className="transition-colors hover:bg-muted/50">
                  <TableCell>
                    <Link href={`/dashboard/buyers/${row.id}`} className="font-medium text-primary hover:underline">
                      @{row.instagram_username}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <TrustScoreBadge score={row.final_trust_score} />
                  </TableCell>
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
                  No analyses yet. Use the extension on Instagram DMs to create your first report.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </section>

      <section className="motion-safe:animate-[rs-fade-in_0.6s_ease-out] rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 text-sm font-semibold text-foreground">Extension workflow</h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-muted-foreground">
          <li>Log in once in the ReturnSense extension popup (same account as this dashboard).</li>
          <li>Open an Instagram DM and use <strong>Analyze Buyer</strong> to capture the thread.</li>
          <li>Confirm phone and address, then run analysis before shipping COD.</li>
        </ol>
      </section>
    </div>
  );
}
