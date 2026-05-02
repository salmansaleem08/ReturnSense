"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

/** Compact donut for quota — theme-aware, no decorative gradients. */
export function UsageQuotaChart({ used, limit }: { used: number; limit: number }) {
  const safeLimit = Math.max(limit, 1);
  const clampedUsed = Math.min(Math.max(used, 0), safeLimit);
  const remaining = Math.max(safeLimit - clampedUsed, 0);
  const data = [
    { name: "Used", value: clampedUsed },
    { name: "Remaining", value: remaining }
  ];

  return (
    <div className="h-[140px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            cx="50%"
            cy="50%"
            innerRadius={44}
            outerRadius={58}
            paddingAngle={2}
            stroke="var(--card)"
            strokeWidth={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={i === 0 ? "var(--primary)" : "var(--muted)"} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              background: "var(--card)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              fontSize: 12
            }}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
