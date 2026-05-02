"use client";

/** Minimal welcome strip — no decorative gradients (marketing gradient stays on the home page only). */
export function DashboardHero() {
  return (
    <section className="motion-safe:animate-[rs-fade-in_0.45s_ease-out] rounded-xl border border-border bg-card px-5 py-5 md:px-6 md:py-6">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Overview</p>
      <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground md:text-2xl">
        Welcome back — COD clarity at a glance
      </h1>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
        Trust scores, outcomes, and buyer history update here as you analyze Instagram chats with the extension.
      </p>
    </section>
  );
}
