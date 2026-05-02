"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { LogoMark } from "@/components/brand/logo-mark";
import { AuthMarketingPanel } from "@/components/auth/auth-marketing-panel";
import { PageAmbientBg } from "@/components/layout/page-ambient";
import { ThemeToggle } from "@/components/theme-toggle";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const USERNAME_RE = /^[\w.]{3,30}$/;

export default function SignupPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/dashboard");
    });
  }, [router, supabase]);

  const usernameOk = USERNAME_RE.test(username.toLowerCase());
  const formValid =
    fullName.trim().length >= 1 && usernameOk && email.includes("@") && password.length >= 8;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!formValid) return;
    setPending(true);
    setError(null);
    const origin =
      typeof window !== "undefined" ? window.location.origin : process.env.NEXT_PUBLIC_APP_URL ?? "";
    const userLower = username.trim().toLowerCase();
    const { error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: fullName.trim(), username: userLower },
        emailRedirectTo: `${origin}/auth/callback?next=/dashboard`
      }
    });
    if (signUpError) {
      setError(signUpError.message);
      setPending(false);
      return;
    }
    router.push(`/verify-email?email=${encodeURIComponent(email.trim())}`);
    setPending(false);
  }

  const inputClass =
    "w-full rounded-lg border border-input bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring";

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
              <h1 className="text-2xl font-semibold text-foreground">Create your account</h1>
              <p className="mt-2 text-sm text-muted-foreground">
                Join sellers who use ReturnSense to stress-test COD decisions before every shipment.
              </p>
            </div>
            <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Full name</label>
                <input
                  className={inputClass}
                  type="text"
                  placeholder="Your name"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Username</label>
                <input
                  className={inputClass}
                  type="text"
                  placeholder="seller_handle"
                  autoComplete="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value.toLowerCase())}
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Email</label>
                <input
                  className={inputClass}
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-muted-foreground">Password</label>
                <input
                  className={inputClass}
                  type="password"
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                />
              </div>
              <button
                type="submit"
                disabled={pending || !formValid}
                className="w-full rounded-lg bg-primary py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-45"
              >
                {pending ? "Signing up…" : "Sign up"}
              </button>
              {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}
              <p className="text-center text-[11px] leading-relaxed text-muted-foreground">
                Username: letters, numbers, underscores, dots — 3–30 characters.
              </p>
            </form>
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="font-semibold text-primary hover:underline">
                Log in
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
