"use client";

/** Hero strip — mesh + title rhythm aligned with marketing home (brand tokens only). */
export function DashboardHero() {
  return (
    <section className="rs-dashboard-hero motion-safe:animate-[rs-fade-in_0.45s_ease-out]">
      <div className="rs-dashboard-hero__mesh" aria-hidden />
      <div className="absolute right-[10%] top-0 h-24 w-24 rounded-full bg-gradient-to-br from-primary/30 to-chart-3/20 opacity-40 blur-2xl" aria-hidden />
      <div className="rs-dashboard-hero__content">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Overview</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-foreground md:text-2xl">
          Welcome back —{" "}
          <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">COD clarity</span> at a
          glance
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
          Trust scores, outcomes, and buyer history update here as you analyze Instagram chats with the extension.
        </p>
      </div>
    </section>
  );
}
