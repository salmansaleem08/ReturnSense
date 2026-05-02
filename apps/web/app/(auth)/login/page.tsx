"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { LogoMark } from "@/components/brand/logo-mark";
import { AuthMarketingPanel } from "@/components/auth/auth-marketing-panel";
import { PageAmbientBg } from "@/components/layout/page-ambient";
import { ThemeToggle } from "@/components/theme-toggle";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/dashboard");
    });
  }, [router, supabase]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const { error: signError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });
    if (signError) setError(signError.message);
    else router.replace("/dashboard");
    setPending(false);
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="w-full space-y-4">
      <div>
        <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <div>
        <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-muted-foreground">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <button
        type="submit"
        disabled={pending || !email.trim() || !password}
        className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
      >
        {pending ? "Logging in…" : "Log in"}
      </button>
      {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}
    </form>
  );
}

export default function LoginPage() {
  return (
    <div className="rs-page-ambient relative min-h-screen bg-background">
      <PageAmbientBg />
      <div className="relative z-10">
      <div className="absolute right-4 top-4 z-20 flex gap-2">
        <ThemeToggle />
        <Link
          href="/"
          className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-muted"
        >
          Home
        </Link>
      </div>

      <div className="mx-auto grid min-h-screen max-w-6xl grid-cols-1 gap-8 px-4 py-16 lg:grid-cols-2 lg:items-center lg:gap-12 lg:px-8 lg:py-12">
        <div className="order-2 lg:order-1">
          <div className="mx-auto w-full max-w-md rounded-2xl border border-border bg-card p-8">
            <div className="mb-8 flex flex-col items-center text-center">
              <LogoMark size={40} className="mb-4" />
              <h1 className="text-2xl font-semibold text-foreground">Welcome back</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Sign in to review buyer trust scores, phone checks, and your dispatch history.
              </p>
            </div>
            <LoginForm />
            <p className="mt-6 text-center text-sm text-muted-foreground">
              No account?{" "}
              <Link href="/signup" className="font-semibold text-primary hover:underline">
                Create one
              </Link>
            </p>
          </div>
        </div>

        <div className="order-1 lg:order-2">
          <AuthMarketingPanel />
        </div>
      </div>
      </div>
    </div>
  );
}
