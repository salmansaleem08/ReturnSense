export function TrustScoreGauge({ score }: { score: number }) {
  const safeScore = Math.max(0, Math.min(100, score));
  const color = safeScore >= 75 ? "#16a34a" : safeScore >= 55 ? "#ca8a04" : safeScore >= 35 ? "#ea580c" : "#dc2626";
  const circumference = 2 * Math.PI * 68;
  const progress = circumference * (safeScore / 100);

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">Trust score</h3>
      <div className="relative mx-auto h-44 w-44">
        <svg viewBox="0 0 160 160" className="h-full w-full -rotate-90">
          <circle cx="80" cy="80" r="68" fill="none" stroke="var(--border)" strokeWidth="12" />
          <circle
            cx="80"
            cy="80"
            r="68"
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${progress} ${circumference}`}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <p className="text-4xl font-bold" style={{ color }}>
              {safeScore}
            </p>
            <p className="text-xs text-muted-foreground">/ 100</p>
          </div>
        </div>
      </div>
    </div>
  );
}
