"use client";

import { MarketingBarSpark, MarketingRiskDonut, MarketingTrendChart } from "@/components/marketing/mini-charts";

/** Illustrative charts + product copy for auth pages (not live account data). */
export function AuthMarketingPanel() {
  return (
    <div
      className="relative flex min-h-[320px] flex-col justify-between overflow-hidden rounded-2xl border border-border/60 p-6 lg:min-h-full"
      style={{
        background:
          "linear-gradient(135deg, hsl(var(--rs-g1) / 0.1) 0%, hsl(var(--rs-g3) / 0.08) 50%, hsl(var(--rs-accent-v) / 0.1) 100%)"
      }}
    >
      <div
        className="pointer-events-none absolute -right-8 -top-8 h-40 w-40 rounded-full blur-2xl"
        style={{ background: "linear-gradient(135deg, hsl(var(--rs-g3) / 0.35), hsl(var(--rs-g1) / 0.2))" }}
      />
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-emerald-700 dark:text-emerald-400">ReturnSense</p>
        <h2 className="mt-2 text-2xl font-bold leading-tight">
          <span className="rs-text-gradient">See risk before you ship COD</span>
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Trust scores, phone and address context, and your own order history — so you waste less time on no-shows and
          chargebacks.
        </p>
      </div>
      <div className="mt-6 space-y-4">
        <div className="rounded-xl border border-border/80 bg-card/80 p-3 backdrop-blur-sm">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Sample trend</p>
          <MarketingTrendChart compact />
        </div>
        <div className="flex gap-3">
          <div className="flex-1 rounded-xl border border-border/80 bg-card/80 p-3 backdrop-blur-sm">
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Risk mix</p>
            <MarketingRiskDonut compact />
          </div>
          <div className="flex-1 rounded-xl border border-border/80 bg-card/80 p-3 backdrop-blur-sm">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Week</p>
            <MarketingBarSpark />
          </div>
        </div>
      </div>
      <p className="mt-4 text-[11px] leading-snug text-muted-foreground">
        Charts shown are examples only. Your dashboard reflects your real analyses after sign-in.
      </p>
    </div>
  );
}
