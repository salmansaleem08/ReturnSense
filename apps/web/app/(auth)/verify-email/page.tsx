"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { LogoMark } from "@/components/brand/logo-mark";
import { PageAmbientBg } from "@/components/layout/page-ambient";
import { ThemeToggle } from "@/components/theme-toggle";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function VerifyEmailInner() {
  const router = useRouter();
  const params = useSearchParams();
  const email = params.get("email") ?? "";
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [cooldown, setCooldown] = useState(0);
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/dashboard");
    });
  }, [router, supabase]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function resend() {
    if (!email.trim() || cooldown > 0 || pending) return;
    setPending(true);
    setMsg(null);
    const { error } = await supabase.auth.resend({ type: "signup", email: email.trim() });
    if (error) setMsg(error.message);
    else {
      setMsg("Confirmation email sent.");
      setCooldown(60);
    }
    setPending(false);
  }

  const disabled = !email.trim() || cooldown > 0 || pending;

  return (
    <div className="rs-page-ambient relative min-h-screen bg-background">
      <PageAmbientBg />
      <div className="relative z-10 flex min-h-screen flex-col items-center px-4 pb-16 pt-10">
        <div className="absolute right-4 top-4 z-20 flex gap-2">
          <ThemeToggle />
          <Link
            href="/"
            className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
          >
            Home
          </Link>
        </div>

        <LogoMark size={40} className="mb-8 mt-[10vh]" />

        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center">
          <h1 className="text-xl font-semibold text-foreground md:text-2xl">Check your email</h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            We sent a link to <strong className="text-foreground">{email || "your email"}</strong>. Click it to activate your account.
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => void resend()}
            className="mt-6 w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-45"
          >
            {pending ? "Sending…" : cooldown > 0 ? `Resend email (${cooldown}s)` : "Resend email"}
          </button>
          {msg ? <p className="mt-4 text-sm text-foreground">{msg}</p> : null}
          <p className="mt-6 text-sm">
            <Link href="/login" className="font-semibold text-primary hover:underline">
              Back to log in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="rs-page-ambient flex min-h-screen items-center justify-center bg-background">
          <PageAmbientBg />
          <p className="relative z-10 text-sm text-muted-foreground">Loading…</p>
        </div>
      }
    >
      <VerifyEmailInner />
    </Suspense>
  );
}
