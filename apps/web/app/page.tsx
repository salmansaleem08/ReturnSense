export default function HomePage() {
  return (
    <div className="mx-auto grid max-w-6xl gap-12 px-4 py-12">
      <section className="rounded-3xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-10 text-center shadow-sm">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 md:text-5xl">
          Stop losing money to fake COD orders
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">
          ReturnSense analyzes buyer chat behavior, validates phone and address quality, and gives
          a trust score before you dispatch.
        </p>
        <a
          href="/login"
          className="mt-8 inline-flex rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white"
        >
          Get Started Free
        </a>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          {
            title: "AI Conversation Analysis",
            body: "Detect hesitation, evasion, and commitment signals directly from Instagram chat."
          },
          {
            title: "Phone Validation",
            body: "Verify line validity, carrier quality, and VoIP risk to prevent fake orders."
          },
          {
            title: "Address Verification",
            body: "Validate delivery addresses with map precision and quality scoring before shipping."
          }
        ].map((feature) => (
          <div key={feature.title} className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-lg font-semibold text-slate-900">{feature.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{feature.body}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-2xl font-semibold text-slate-900">How it works</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {[
            "Analyze buyer chat from Instagram extension",
            "Get a transparent trust score with risk signals",
            "Decide confidently before dispatching COD parcel"
          ].map((step, idx) => (
            <div key={step} className="rounded-xl bg-slate-50 p-4">
              <p className="text-xs font-semibold text-slate-500">STEP {idx + 1}</p>
              <p className="mt-1 text-sm text-slate-700">{step}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {[
          { name: "Free", price: "20 analyses / month", amount: "$0" },
          { name: "Pro", price: "Unlimited analyses", amount: "$15/mo" },
          { name: "Agency", price: "Team workflows + volume", amount: "$49/mo" }
        ].map((plan) => (
          <div key={plan.name} className="rounded-2xl border border-slate-200 bg-white p-5">
            <p className="text-sm font-semibold text-slate-500">{plan.name}</p>
            <p className="mt-1 text-3xl font-bold text-slate-900">{plan.amount}</p>
            <p className="mt-2 text-sm text-slate-600">{plan.price}</p>
          </div>
        ))}
      </section>
    </div>
  );
}
