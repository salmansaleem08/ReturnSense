"use client";

import { useId } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

/** Small donut for monthly quota — colors follow `--rs-g*` theme tokens. */
export function UsageQuotaChart({ used, limit }: { used: number; limit: number }) {
  const uid = useId().replace(/:/g, "");
  const gradId = `rsUsageGrad-${uid}`;

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
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="hsl(var(--rs-g1))" />
              <stop offset="50%" stopColor="hsl(var(--rs-g2))" />
              <stop offset="100%" stopColor="hsl(var(--rs-g3))" />
            </linearGradient>
          </defs>
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
              <Cell key={i} fill={i === 0 ? `url(#${gradId})` : "var(--muted)"} />
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
