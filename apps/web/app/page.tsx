export default function HomePage() {
  return (
    <div className="mx-auto grid max-w-ig gap-10 px-4 py-12 md:gap-14">
      <section className="rounded-xl border border-border bg-card px-6 py-10 text-center shadow-sm md:px-10">
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight text-foreground md:text-3xl">
          Stop losing money to fake COD orders
        </h1>
        <p className="mx-auto mt-4 max-w-feed text-sm leading-[18px] text-muted-foreground md:text-base md:leading-snug">
          ReturnSense analyzes buyer chat behavior, validates phone and address quality, and gives a trust score
          before you dispatch.
        </p>
        <a
          href="/login"
          className="mt-8 inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Get started free
        </a>
      </section>

      <section className="grid gap-3 md:grid-cols-3 md:gap-2">
        {[
          {
            title: "AI conversation analysis",
            body: "Detect hesitation, evasion, and commitment signals directly from Instagram chat."
          },
          {
            title: "Phone validation",
            body: "Verify line validity, carrier quality, and VoIP risk to prevent fake orders."
          },
          {
            title: "Address verification",
            body: "Validate delivery addresses with map precision and quality scoring before shipping."
          }
        ].map((feature) => (
          <div
            key={feature.title}
            className="rounded-[var(--radius-md)] border border-border bg-card p-4 shadow-none"
          >
            <h3 className="text-sm font-semibold text-foreground">{feature.title}</h3>
            <p className="mt-2 text-sm leading-[18px] text-muted-foreground">{feature.body}</p>
          </div>
        ))}
      </section>

      <section className="rounded-[var(--radius-md)] border border-border bg-card p-6">
        <h2 className="text-base font-semibold text-foreground">How it works</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3 md:gap-2">
          {[
            "Analyze buyer chat from the Instagram extension",
            "Get a transparent trust score with risk signals",
            "Decide confidently before dispatching COD"
          ].map((step, idx) => (
            <div key={step} className="rounded-[var(--radius-sm)] bg-muted/80 p-4 dark:bg-muted/50">
              <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
                Step {idx + 1}
              </p>
              <p className="mt-1 text-sm leading-[18px] text-foreground">{step}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-3 md:grid-cols-3 md:gap-2">
        {[
          { name: "Free", price: "20 analyses / month", amount: "$0" },
          { name: "Pro", price: "Unlimited analyses", amount: "$15/mo" },
          { name: "Agency", price: "Team workflows + volume", amount: "$49/mo" }
        ].map((plan) => (
          <div key={plan.name} className="rounded-[var(--radius-md)] border border-border bg-card p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{plan.name}</p>
            <p className="mt-2 text-2xl font-semibold text-foreground">{plan.amount}</p>
            <p className="mt-2 text-sm text-muted-foreground">{plan.price}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
