import type { Metadata } from "next";
import Link from "next/link";
import {
  CheckCircle2,
  MapPin,
  MessageSquare,
  Phone,
  Shield,
  Sparkles,
  TrendingUp
} from "lucide-react";

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
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_80%_50%_at_50%_-20%,hsl(160_84%_45%/0.18),transparent)]" />
        <div className="pointer-events-none absolute -right-24 top-1/4 h-72 w-72 rounded-full bg-gradient-to-br from-cyan-500/20 to-emerald-500/10 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 bottom-0 h-64 w-64 rounded-full bg-gradient-to-tr from-violet-500/15 to-teal-500/10 blur-3xl" />

        <div className="relative mx-auto grid max-w-6xl gap-10 px-4 pb-20 pt-14 md:grid-cols-2 md:items-center md:gap-12 md:px-6 lg:pb-28 lg:pt-20">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <Shield className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
              COD risk clarity for serious sellers
            </p>
            <h1 className="mt-5 text-4xl font-bold tracking-tight text-foreground md:text-5xl lg:text-[3.25rem] lg:leading-[1.1]">
              Fewer fake orders.
              <span className="mt-1 block rs-text-gradient lg:mt-2">Faster confident dispatch.</span>
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-muted-foreground md:text-lg">
              ReturnSense helps you decide which Instagram buyers to trust for cash-on-delivery — with clear scores, phone and
              address context, and a record of what you actually experienced on each order.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/signup"
                className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                Start free
              </Link>
              <Link
                href="/login"
                className="inline-flex h-11 items-center justify-center rounded-xl border border-border bg-card px-6 text-sm font-semibold text-foreground transition hover:bg-muted"
              >
                Log in
              </Link>
            </div>
            <ul className="mt-10 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:flex-wrap sm:gap-x-6">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                No buyer auto-blocking
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                Built for DMs & COD
              </li>
            </ul>
          </div>

          <div className="relative rounded-2xl border border-border bg-card p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-muted/30 p-3 dark:bg-muted/20">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Illustrative trend</p>
                <MarketingTrendChart />
              </div>
              <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-muted/30 p-3 dark:bg-muted/20">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Risk mix</p>
                <MarketingRiskDonut />
              </div>
            </div>
            <div className="mt-4 rounded-xl border border-border bg-muted/20 p-3">
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Activity (sample)</p>
              <MarketingBarSpark />
            </div>
          </div>
        </div>
      </section>

      <section id="features" className="border-b border-border/60 py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight md:text-4xl">
            <span className="rs-text-gradient">What you get</span>
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-center text-muted-foreground">
            Everything is framed around your commercial decision: trust the buyer enough to send stock on COD, or protect your
            margin first.
          </p>
          <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <div
                key={f.title}
                className="group rounded-2xl border border-border bg-card p-6 transition hover:border-border"
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/15 to-cyan-500/10 text-emerald-700 dark:text-emerald-400">
                  <f.icon className="h-5 w-5" />
                </div>
                <h3 className="mt-4 font-semibold text-foreground">{f.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="how" className="relative overflow-hidden py-20 md:py-28">
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-muted/40 via-transparent to-muted/30" />
        <div className="relative mx-auto max-w-6xl px-4 md:px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight md:text-4xl">
            <span className="rs-text-gradient">How it works</span>
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">Three steps from chat to a confident dispatch call.</p>
          <div className="mt-14 grid gap-8 md:grid-cols-3">
            {steps.map((s, i) => (
              <div key={s.title} className="relative rounded-2xl border border-border bg-card p-8">
                <span className="absolute -top-3 left-8 inline-flex h-8 min-w-[2rem] items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 px-2 text-sm font-bold text-white">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="pricing" className="border-t border-border/60 py-20 md:py-28">
        <div className="mx-auto max-w-6xl px-4 md:px-6">
          <h2 className="text-center text-3xl font-bold tracking-tight md:text-4xl">
            <span className="rs-text-gradient">Simple plans</span>
          </h2>
          <p className="mx-auto mt-3 max-w-lg text-center text-muted-foreground">
            Start free and scale when your order volume grows.
          </p>
          <div className="mt-14 grid gap-6 md:grid-cols-3">
            {plans.map((p) => (
              <div
                key={p.name}
                className={`rounded-2xl border p-8 ${
                  p.highlight
                    ? "border-primary/40 bg-primary/5"
                    : "border-border bg-card"
                }`}
              >
                <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">{p.name}</p>
                <p className="mt-3 text-3xl font-bold text-foreground">{p.price}</p>
                <p className="mt-2 text-sm text-muted-foreground">{p.detail}</p>
                <Link
                  href="/signup"
                  className={`mt-8 flex h-11 w-full items-center justify-center rounded-xl text-sm font-semibold ${
                    p.highlight
                      ? "bg-primary text-primary-foreground hover:opacity-90"
                      : "border border-border bg-background hover:bg-muted"
                  }`}
                >
                  Choose {p.name}
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      <footer className="border-t border-border py-10">
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
