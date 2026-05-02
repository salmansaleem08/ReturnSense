"use client";

/** Decorative hero — CSS-only “abstract” visuals (no external image APIs or secrets). */
export function DashboardHero() {
  return (
    <section className="rs-dashboard-hero motion-safe:animate-[rs-fade-in_0.45s_ease-out]">
      <div className="rs-dashboard-hero__mesh" aria-hidden />
      <div className="rs-dashboard-hero__orb rs-dashboard-hero__orb--a" aria-hidden />
      <div className="rs-dashboard-hero__orb rs-dashboard-hero__orb--b" aria-hidden />
      <div className="rs-dashboard-hero__content">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Fraud prevention
        </p>
        <h1 className="mt-1 text-xl font-bold tracking-tight md:text-2xl">
          <span className="text-foreground">Welcome back — </span>
          <span className="rs-text-gradient">COD clarity at a glance</span>
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Trust scores, outcomes, and buyer history update here as you analyze Instagram chats with the extension.
        </p>
      </div>
    </section>
  );
}
