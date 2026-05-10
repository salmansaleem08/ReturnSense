import type { Metadata } from "next";
import Link from "next/link";
import { CheckCircle2, MapPin, MessageSquare, Phone, Shield, Sparkles, TrendingUp } from "lucide-react";

import { PageAmbientBg } from "@/components/layout/page-ambient";
import { MarketingBarSpark, MarketingRiskDonut, MarketingTrendChart } from "@/components/marketing/mini-charts";
import { PublicHeader } from "@/components/marketing/public-header";

export const metadata: Metadata = {
  title: "ReturnSense — Smarter COD decisions for Instagram sellers",
  description:
    "Trust scores, phone and address context, and your own outcomes — so you ship cash-on-delivery with less guesswork."
};

const features = [
  {
    icon: MessageSquare,
    title: "Chat intelligence",
    text: "Turn long buyer conversations into clear risk signals and a single trust view before you commit stock or dispatch."
  },
  {
    icon: Phone,
    title: "Phone confidence",
    text: "See whether a number looks like a real mobile line, which network it’s on, and when something looks off for delivery."
  },
  {
    icon: MapPin,
    title: "Address quality",
    text: "Check that a delivery address resolves cleanly on the map and isn’t vague city-only text that tends to fail COD."
  },
  {
    icon: Shield,
    title: "Seller-first decisions",
    text: "ReturnSense never blocks a buyer for you. You stay in control — we surface evidence so you can ship or pause with confidence."
  },
  {
    icon: TrendingUp,
    title: "History at a glance",
    text: "Track outcomes over time, spot repeat risky handles, and tighten how your team uses COD without slowing sales."
  },
  {
    icon: Sparkles,
    title: "Built for Instagram sellers",
    text: "Works alongside your existing DM workflow — analyze when you’re ready, without changing how buyers reach you."
  }
];

const steps = [
  {
    title: "Capture the conversation",
    text: "Pull in the buyer thread from your workflow when you’re considering a COD order."
  },
  {
    title: "Review trust & signals",
    text: "Get a structured score plus positives and risks tied to what was actually said and submitted."
  },
  {
    title: "Dispatch with clarity",
    text: "Use your own policy — ship, ask for more proof, or walk away with less guesswork."
  }
];

const plans = [
  {
    name: "Starter",
    price: "$0",
    detail: "Up to 20 analyses / month",
    highlight: false
  },
  {
    name: "Pro",
    price: "$15/mo",
    detail: "Higher limits & priority use",
    highlight: true
  },
  {
    name: "Agency",
    price: "$49/mo",
    detail: "Volume & team-friendly",
    highlight: false
  }
];

export default function HomePage() {
  return (
    <div className="rs-page-ambient relative min-h-screen bg-background text-foreground">
      <PageAmbientBg />

      <div className="relative z-10">
      <PublicHeader />

      <section className="relative overflow-hidden border-b border-border/60">
        {/* Radial + mesh glows — token-only (primary / secondary / chart), no arbitrary palette */}
        <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_60%_at_50%_-10%,color-mix(in_oklab,var(--primary)_14%,transparent),transparent_70%)]" />
        <div className="pointer-events-none absolute -right-24 top-1/4 h-72 w-72 rounded-full bg-gradient-to-br from-primary/25 via-chart-3/15 to-transparent blur-3xl" />
        <div className="pointer-events-none absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-gradient-to-tr from-secondary/20 via-chart-2/10 to-transparent blur-3xl" />

        <div className="relative mx-auto grid max-w-6xl gap-10 px-6 pb-20 pt-14 text-center sm:text-left md:grid-cols-2 md:items-center md:gap-12 md:px-10 lg:pb-28 lg:pt-20">
          <div className="animate-page-in">
            <div className="inline-flex justify-center sm:justify-start">
              <span className="rounded-full border border-primary/30 bg-primary/8 px-3 py-1 text-xs font-medium text-primary">
                COD clarity for Instagram sellers
              </span>
            </div>
            <h1 className="mt-6 text-5xl font-bold leading-[1.12] tracking-tight text-foreground sm:text-6xl lg:text-7xl">
              Fewer fake orders.
              <br className="hidden sm:block" />
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
                Faster confident dispatch.
              </span>
            </h1>
            <p className="mx-auto mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground sm:mx-0 md:text-xl md:leading-relaxed">
              ReturnSense helps you decide which buyers to trust for cash-on-delivery — clear scores, phone and address
              context, and a record of what you experienced on each order.
            </p>
            <div className="mt-10 flex flex-wrap items-center justify-center gap-3 sm:justify-start">
              <Link
                href="/signup"
                className="inline-flex h-12 items-center justify-center rounded-md bg-primary px-8 text-sm font-semibold text-primary-foreground shadow-md shadow-primary/25 transition-all hover:bg-primary/90 hover:shadow-lg hover:shadow-primary/30"
              >
                Start free
              </Link>
              <Link
                href="/login"
                className="inline-flex h-12 items-center justify-center rounded-md border border-border bg-background px-7 text-sm font-medium text-foreground shadow-xs transition-colors hover:bg-accent hover:text-accent-foreground"
              >
                Log in
              </Link>
            </div>
            <ul className="mt-10 flex flex-col items-center gap-2 text-sm text-muted-foreground sm:items-start sm:flex-row sm:flex-wrap sm:gap-x-6">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                No buyer auto-blocking
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" />
                Built for DMs &amp; COD
              </li>
            </ul>
          </div>

          <div className="card-hover relative rounded-xl border border-border bg-card p-4 shadow-sm">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted/40 p-3 dark:bg-muted/25">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Illustrative trend</p>
                <MarketingTrendChart />
              </div>
              <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-muted/40 p-3 dark:bg-muted/25">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Risk mix</p>
                <MarketingRiskDonut />
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-border bg-muted/30 p-3 dark:bg-muted/20">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activity (sample)</p>
              <MarketingBarSpark />
            </div>
          </div>
        </div>
      </section>

      {/* Stats strip — layout rhythm borrowed from CodeSage marketing */}
      <section className="mx-auto max-w-6xl px-6 md:px-10">
        <hr className="border-border/60" />
        <div className="grid grid-cols-1 gap-6 py-8 text-center sm:grid-cols-3 sm:gap-4">
          <div className="flex flex-col items-center gap-1 px-4">
            <span className="text-sm font-semibold text-foreground">Trust scoring</span>
            <span className="text-xs text-muted-foreground">One number plus explicit signals</span>
          </div>
          <div className="flex flex-col items-center gap-1 border-border/60 px-4 sm:border-x">
            <span className="text-sm font-semibold text-foreground">Phone &amp; address</span>
            <span className="text-xs text-muted-foreground">Context before you dispatch</span>
          </div>
          <div className="flex flex-col items-center gap-1 px-4">
            <span className="text-sm font-semibold text-foreground">Your outcomes</span>
            <span className="text-xs text-muted-foreground">You stay in control — always</span>
          </div>
        </div>
        <hr className="border-border/60" />
      </section>

      <section id="features" className="border-b border-border/60 py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <div className="mb-14 space-y-3 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              What you get.{" "}
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">One goal.</span>
            </h2>
            <p className="mx-auto max-w-2xl text-base text-muted-foreground">
              Everything is framed around your commercial decision: trust the buyer enough to send stock on COD, or protect
              your margin first.
            </p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f, i) => (
              <article
                key={f.title}
                className="group rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/40"
              >
                <div className="mb-4 inline-flex rounded-lg bg-muted p-2.5">
                  <f.icon className="size-5 text-foreground/80" />
                </div>
                <div className="mb-3">
                  <span className="rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                    {["DMs", "Phone", "Address", "Policy", "History", "Workflow"][i] ?? "Feature"}
                  </span>
                </div>
                <h3 className="mb-2 text-sm font-semibold text-foreground">{f.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{f.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="relative overflow-hidden py-20 md:py-28">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-muted/35 via-transparent to-muted/25" />
        <div className="relative mx-auto max-w-6xl px-4 md:px-6">
          <div className="mb-14 space-y-3 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              How it{" "}
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">works</span>
            </h2>
            <p className="mx-auto max-w-xl text-base text-muted-foreground">
              Three steps from chat to a confident dispatch call.
            </p>
          </div>
          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {steps.map((s, i) => (
              <div key={s.title} className="card-hover relative rounded-xl border border-border bg-card p-8 pt-10 shadow-sm">
                <span className="absolute -top-3 left-8 inline-flex h-8 min-w-[2rem] items-center justify-center rounded-full bg-gradient-to-br from-primary to-secondary px-2 text-sm font-bold text-primary-foreground shadow-sm">
                  {i + 1}
                </span>
                <h3 className="text-lg font-semibold text-foreground">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="border-t border-border/60 py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <div className="mb-14 space-y-3 text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Simple{" "}
              <span className="bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">plans</span>
            </h2>
            <p className="mx-auto max-w-lg text-base text-muted-foreground">
              Start free and scale when your order volume grows.
            </p>
          </div>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {plans.map((p) => (
              <div
                key={p.name}
                className={`card-hover rounded-xl border p-8 shadow-sm ${
                  p.highlight ? "border-primary/35 bg-primary/5" : "border-border bg-card"
                }`}
              >
                <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{p.name}</p>
                <p className="mt-3 text-3xl font-bold tracking-tight text-foreground">{p.price}</p>
                <p className="mt-2 text-sm text-muted-foreground">{p.detail}</p>
                <Link
                  href="/signup"
                  className={`mt-8 flex h-11 w-full items-center justify-center rounded-md text-sm font-semibold transition-all ${
                    p.highlight
                      ? "bg-primary text-primary-foreground shadow-md shadow-primary/20 hover:bg-primary/90"
                      : "border border-border bg-background hover:bg-accent hover:text-accent-foreground"
                  }`}
                >
                  Choose {p.name}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 pb-24 md:px-6">
        <div className="rounded-xl bg-secondary px-8 py-14 text-center text-secondary-foreground sm:px-10 sm:py-16">
          <h2 className="mb-3 text-2xl font-bold tracking-tight sm:text-3xl">Ready to ship COD with less guesswork?</h2>
          <p className="mx-auto mb-8 max-w-md text-sm leading-relaxed text-secondary-foreground/80">
            Join sellers who use evidence from DMs and contact signals before they commit stock.
          </p>
          <Link
            href="/signup"
            className="inline-flex h-11 items-center justify-center rounded-md border border-secondary-foreground/35 bg-background px-8 text-sm font-semibold text-foreground shadow-sm transition-colors hover:bg-background/90"
          >
            Get started free
          </Link>
        </div>
      </section>

      <footer className="border-t border-border/60 py-10">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 text-sm text-muted-foreground md:flex-row md:px-6">
          <p>© {new Date().getFullYear()} ReturnSense. All rights reserved.</p>
          <div className="flex gap-6">
            <Link href="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link href="/login" className="hover:text-foreground">
              Log in
            </Link>
          </div>
        </div>
      </footer>
      </div>
    </div>
  );
}
