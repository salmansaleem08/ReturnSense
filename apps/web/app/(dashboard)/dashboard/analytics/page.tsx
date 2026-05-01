"use client";

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

const COLORS = ["#16a34a", "#f59e0b", "#dc2626", "#64748b"];

export default function AnalyticsPage() {
  const [buyers, setBuyers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    async function load() {
      const { data } = await supabase.from("buyers").select("*").order("created_at", { ascending: false });
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

  if (loading) return <div className="rounded-xl border border-slate-200 bg-white p-6">Loading analytics...</div>;

  return (
    <div className="grid gap-5">
      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard title="Trust Score Distribution">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={trustDistribution}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="bucket" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Analyses Over Time (30 days)">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={analysesOverTime}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard title="Outcome Breakdown">
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={outcomeBreakdown} dataKey="value" nameKey="name" innerRadius={70} outerRadius={100}>
                {outcomeBreakdown.map((entry, index) => (
                  <Cell key={entry.name} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Legend />
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Risk Level Distribution">
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={riskDistribution} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" />
              <YAxis dataKey="level" type="category" />
              <Tooltip />
              <Bar dataKey="count" fill="#0f172a" />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>

      <ChartCard title="Average Trust Score by Outcome">
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={trustByOutcome}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="outcome" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="avg" fill="#16a34a" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-slate-600">{title}</h3>
      {children}
    </div>
  );
}
