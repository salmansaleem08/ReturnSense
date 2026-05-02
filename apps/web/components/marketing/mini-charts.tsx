"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

const trend = [
  { m: "Jan", v: 12 },
  { m: "Feb", v: 18 },
  { m: "Mar", v: 24 },
  { m: "Apr", v: 31 },
  { m: "May", v: 28 },
  { m: "Jun", v: 42 }
];

const riskMix = [
  { name: "Low", value: 52, fill: "var(--chart-2)" },
  { name: "Med", value: 28, fill: "var(--chart-4)" },
  { name: "High", value: 14, fill: "var(--chart-5)" },
  { name: "Crit", value: 6, fill: "hsl(350 70% 55%)" }
];

const weekly = [
  { day: "M", n: 8 },
  { day: "T", n: 12 },
  { day: "W", n: 15 },
  { day: "T", n: 11 },
  { day: "F", n: 19 },
  { day: "S", n: 22 },
  { day: "S", n: 14 }
];

/** Illustrative-only charts for marketing / auth (not live data). */
export function MarketingTrendChart({ compact }: { compact?: boolean }) {
  const h = compact ? 120 : 160;
  return (
    <div className="w-full" style={{ height: h }}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={trend} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="fillTrend" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(160 84% 39%)" stopOpacity={0.35} />
              <stop offset="100%" stopColor="hsl(160 84% 39%)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/60" />
          <XAxis dataKey="m" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
          <YAxis hide />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              fontSize: "12px"
            }}
          />
          <Area type="monotone" dataKey="v" stroke="hsl(160 84% 32%)" fill="url(#fillTrend)" strokeWidth={2} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MarketingRiskDonut({ compact }: { compact?: boolean }) {
  const size = compact ? 100 : 120;
  return (
    <div style={{ width: size, height: size }} className="mx-auto">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={riskMix} dataKey="value" innerRadius={compact ? 28 : 34} outerRadius={compact ? 44 : 52} paddingAngle={2}>
            {riskMix.map((e, i) => (
              <Cell key={i} fill={e.fill} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

export function MarketingBarSpark() {
  return (
    <div className="h-[100px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={weekly} margin={{ top: 4, right: 4, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(199 89% 48%)" />
              <stop offset="100%" stopColor="hsl(199 89% 35%)" />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border/50" vertical={false} />
          <XAxis dataKey="day" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
          <YAxis hide />
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              fontSize: "12px"
            }}
          />
          <Bar dataKey="n" radius={[4, 4, 0, 0]} fill="url(#barGrad)" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
