"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const RISK_COLORS: Record<string, string> = {
  low: "#1D9A0B",
  medium: "#D4A017",
  high: "#E8490F",
  critical: "#ED4956"
};

const OUTCOME_COLORS: Record<string, string> = {
  delivered: "#1D9A0B",
  returned: "#D4A017",
  fake: "#ED4956",
  pending: "#8E8E8E"
};

export default function AnalyticsPage() {
  const [buyers, setBuyers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    async function load() {
      const { data } = await supabase
        .from("buyers")
        .select("*")
        .is("deleted_at", null)
        .order("created_at", { ascending: false });
      setBuyers(data || []);
      setLoading(false);
    }
    load();
  }, []);

  const trustDistribution = useMemo(() => {
    const buckets = { "0-25": 0, "26-50": 0, "51-75": 0, "76-100": 0 };
    buyers.forEach((buyer) => {
      const score = buyer.final_trust_score ?? 0;
      if (score <= 25) buckets["0-25"] += 1;
      else if (score <= 50) buckets["26-50"] += 1;
      else if (score <= 75) buckets["51-75"] += 1;
      else buckets["76-100"] += 1;
    });
    return Object.entries(buckets).map(([bucket, value]) => ({ bucket, value }));
  }, [buyers]);

  const analysesOverTime = useMemo(() => {
    const map = new Map<string, number>();
    const now = new Date();
    for (let i = 29; i >= 0; i -= 1) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      map.set(d.toISOString().slice(0, 10), 0);
    }
    buyers.forEach((buyer) => {
      const day = new Date(buyer.created_at).toISOString().slice(0, 10);
      if (map.has(day)) map.set(day, (map.get(day) || 0) + 1);
    });
    return Array.from(map.entries()).map(([day, count]) => ({ day: day.slice(5), count }));
  }, [buyers]);

  const outcomeBreakdown = useMemo(() => {
    const map: Record<string, number> = { delivered: 0, returned: 0, fake: 0, pending: 0 };
    buyers.forEach((buyer) => {
      const key = buyer.outcome || "pending";
      if (key in map) map[key] += 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [buyers]);

  const riskDistribution = useMemo(() => {
    const map: Record<string, number> = { low: 0, medium: 0, high: 0, critical: 0 };
    buyers.forEach((buyer) => {
      const key = buyer.final_risk_level || "critical";
      if (key in map) map[key] += 1;
    });
    return Object.entries(map).map(([level, count]) => ({ level, count }));
  }, [buyers]);

  const trustByOutcome = useMemo(() => {
    const map: Record<string, { total: number; count: number }> = {
      delivered: { total: 0, count: 0 },
      returned: { total: 0, count: 0 },
      fake: { total: 0, count: 0 },
      pending: { total: 0, count: 0 }
    };
    buyers.forEach((buyer) => {
      const key = buyer.outcome || "pending";
      const score = buyer.final_trust_score ?? 0;
      if (map[key]) {
        map[key].total += score;
        map[key].count += 1;
      }
    });
    return Object.entries(map).map(([outcome, stat]) => ({
      outcome,
      avg: stat.count ? Math.round(stat.total / stat.count) : 0
    }));
  }, [buyers]);

  const summary = useMemo(() => {
    const total = buyers.length;
    const scores = buyers.map((b) => b.final_trust_score).filter((n: unknown) => typeof n === "number");
    const avgTrust = scores.length ? Math.round(scores.reduce((a: number, b: number) => a + b, 0) / scores.length) : 0;
    const critical = buyers.filter((b) => b.final_risk_level === "critical").length;
    const pendingOutcomes = buyers.filter((b) => !b.outcome || b.outcome === "pending").length;
    const scams = buyers.filter((b) => b.outcome === "fake").length;
    return { total, avgTrust, critical, pendingOutcomes, scams };
  }, [buyers]);

  if (loading) {
    return (
      <div className="rounded-[var(--radius-md)] border border-border bg-card p-8 text-center text-sm text-muted-foreground">
        Loading analytics…
      </div>
    );
  }

  return (
    <div className="grid w-full gap-6 motion-safe:animate-[rs-fade-in_0.45s_ease-out]">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          <span className="rs-text-gradient">Analytics</span>
        </h1>
        <p className="text-sm text-muted-foreground">Trust, risk, and outcome patterns across your buyers</p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <Kpi title="Total analyses" value={summary.total} />
        <Kpi title="Avg trust score" value={summary.avgTrust} />
        <Kpi title="Critical risk" value={summary.critical} />
        <Kpi title="Pending outcomes" value={summary.pendingOutcomes} />
        <Kpi title="Scams (fake)" value={summary.scams} />
      </section>

      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard title="Trust score distribution">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={trustDistribution}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="bucket" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
              <Tooltip
                contentStyle={{ border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, background: "var(--card)" }}
              />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {trustDistribution.map((_, i) => (
                  <Cell
                    key={i}
                    fill={
                      [
                        "hsl(var(--rs-accent-v))",
                        "var(--destructive)",
                        "hsl(var(--chart-4))",
                        "hsl(var(--rs-g1))"
                      ][i] ?? "hsl(var(--rs-g2))"
                    }
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Analyses over time (30 days)">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={analysesOverTime}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="day" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
              <Tooltip
                contentStyle={{ border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, background: "var(--card)" }}
              />
              <Line type="monotone" dataKey="count" stroke="hsl(var(--rs-g2))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard title="Outcome breakdown">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={outcomeBreakdown} dataKey="value" nameKey="name" innerRadius={70} outerRadius={100}>
                {outcomeBreakdown.map((entry) => (
                  <Cell key={entry.name} fill={OUTCOME_COLORS[entry.name] ?? "var(--muted-foreground)"} />
                ))}
              </Pie>
              <Legend />
              <Tooltip
                contentStyle={{ border: "1px solid var(--border)", borderRadius: 8, background: "var(--card)", fontSize: 12 }}
              />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Risk level">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={riskDistribution} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis type="number" allowDecimals={false} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
              <YAxis dataKey="level" type="category" width={72} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
              <Tooltip
                contentStyle={{ border: "1px solid var(--border)", borderRadius: 8, background: "var(--card)", fontSize: 12 }}
              />
              <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                {riskDistribution.map((r) => (
                  <Cell key={r.level} fill={RISK_COLORS[r.level] ?? "var(--muted-foreground)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Average trust score by outcome">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={trustByOutcome}>
            <defs>
              <linearGradient id="rsAvgTrustBars" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="hsl(var(--rs-g1))" />
                <stop offset="50%" stopColor="hsl(var(--rs-g2))" />
                <stop offset="100%" stopColor="hsl(var(--rs-g3))" />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="outcome" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
            <YAxis domain={[0, 100]} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} />
            <Tooltip
              contentStyle={{ border: "1px solid var(--border)", borderRadius: 8, background: "var(--card)", fontSize: 12 }}
            />
            <Bar dataKey="avg" fill="url(#rsAvgTrustBars)" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function Kpi({ title, value }: { title: string; value: number }) {
  return (
    <div className="relative overflow-hidden rounded-[var(--radius-md)] border border-border bg-card p-4 pt-3 shadow-none transition-shadow hover:shadow-md">
      <div className="rs-top-accent absolute left-3 right-3 top-0" />
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{title}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{value}</p>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rs-card-elevated rounded-[var(--radius-md)] p-4">
      <h3 className="mb-3 text-base font-bold tracking-tight rs-text-gradient">{title}</h3>
      {children}
    </div>
  );
}
