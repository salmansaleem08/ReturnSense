"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function LoginPage() {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pendingGoogle, setPendingGoogle] = useState(false);
  const [pendingPassword, setPendingPassword] = useState(false);
  const [pendingRegister, setPendingRegister] = useState(false);
  const [pendingMagic, setPendingMagic] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) router.replace("/dashboard");
    });
  }, [router, supabase]);

  async function handleGoogle() {
    setPendingGoogle(true);
    setError(null);
    const origin = window.location.origin;
    const { error: signInError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${origin}/auth/callback?next=/dashboard`
      }
    });
    if (signInError) {
      setError(signInError.message);
      setPendingGoogle(false);
    }
  }

  async function handleSignInPassword(e: FormEvent) {
    e.preventDefault();
    setPendingPassword(true);
    setMessage(null);
    setError(null);
    const { error: signError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password
    });
    if (signError) {
      setError(signError.message);
    } else {
      router.replace("/dashboard");
    }
    setPendingPassword(false);
  }

  async function handleRegister(e: FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    setPendingRegister(true);
    setMessage(null);
    setError(null);
    const origin = window.location.origin;
    const { error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=/dashboard`
      }
    });
    if (signUpError) {
      setError(signUpError.message);
    } else {
      setMessage(
        "Check your email to confirm your account. After confirmation, sign in with email and password here."
      );
      setPassword("");
      setConfirmPassword("");
    }
    setPendingRegister(false);
  }

  async function handleMagicLink() {
    setPendingMagic(true);
    setMessage(null);
    setError(null);
    const origin = window.location.origin;
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=/dashboard`
      }
    });
    if (otpError) {
      setError(otpError.message);
    } else {
      setMessage("Check your email for the sign-in link.");
    }
    setPendingMagic(false);
  }

  return (
    <Card className="w-full max-w-md border border-border bg-card shadow-sm">
      <CardHeader className="space-y-4 text-center">
        <Image
          src="/logo.svg"
          alt="ReturnSense"
          width={128}
          height={128}
          className="mx-auto h-24 w-24"
          priority
        />
        <div>
          <CardTitle className="text-2xl font-bold leading-none">ReturnSense</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Sign in to manage buyer risk intelligence.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2">
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full rounded-md border-border font-semibold"
            onClick={handleGoogle}
            disabled={pendingGoogle}
          >
            {pendingGoogle ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
            Continue with Google
          </Button>
          <p className="text-center text-[11px] leading-snug text-muted-foreground">
            If you see <span className="font-medium text-foreground">invalid_client</span> or{" "}
            <span className="font-medium text-foreground">OAuth client was not found</span>, add Web application
            OAuth credentials in Google Cloud Console, then paste the Client ID and Secret in Supabase →
            Authentication → Providers → Google. Authorized redirect URI must include{" "}
            <code className="rounded bg-muted px-1 py-0.5 text-[10px]">…/auth/v1/callback</code> on your Supabase
            project URL.
          </p>
        </div>

        <Tabs defaultValue="signin" className="w-full">
          <TabsList className="grid h-10 w-full grid-cols-3 rounded-[var(--radius-sm)] bg-muted p-1">
            <TabsTrigger value="signin" className="rounded-[var(--radius-xs)] text-xs font-semibold sm:text-sm">
              Sign in
            </TabsTrigger>
            <TabsTrigger value="signup" className="rounded-[var(--radius-xs)] text-xs font-semibold sm:text-sm">
              Sign up
            </TabsTrigger>
            <TabsTrigger value="magic" className="rounded-[var(--radius-xs)] text-xs font-semibold sm:text-sm">
              Email link
            </TabsTrigger>
          </TabsList>

          <TabsContent value="signin" className="space-y-3 pt-4">
            <form onSubmit={handleSignInPassword} className="space-y-3">
              <Input
                type="email"
                autoComplete="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11"
                required
              />
              <Input
                type="password"
                autoComplete="current-password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11"
                required
              />
              <Button
                type="submit"
                className="h-11 w-full rounded-md font-semibold"
                disabled={pendingPassword || !email || !password}
              >
                {pendingPassword ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Sign in
              </Button>
            </form>
          </TabsContent>

          <TabsContent value="signup" className="space-y-3 pt-4">
            <form onSubmit={handleRegister} className="space-y-3">
              <Input
                type="email"
                autoComplete="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="h-11"
                required
              />
              <Input
                type="password"
                autoComplete="new-password"
                placeholder="Password (min 8 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="h-11"
                required
              />
              <Input
                type="password"
                autoComplete="new-password"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="h-11"
                required
              />
              <Button
                type="submit"
                className="h-11 w-full rounded-md font-semibold"
                disabled={pendingRegister || !email || !password}
              >
                {pendingRegister ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Create account
              </Button>
              <p className="text-center text-[11px] text-muted-foreground">
                First time only: we&apos;ll send a confirmation email. Then use{" "}
                <span className="font-medium text-foreground">Sign in</span> with the same email and password.
              </p>
            </form>
          </TabsContent>

          <TabsContent value="magic" className="space-y-3 pt-4">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-11"
            />
            <Button
              type="button"
              variant="secondary"
              className="h-11 w-full rounded-md border border-border font-semibold"
              onClick={handleMagicLink}
              disabled={pendingMagic || !email.trim()}
            >
              {pendingMagic ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Send sign-in link
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">
              Passwordless login — link opens in your browser and returns you to the dashboard.
            </p>
          </TabsContent>
        </Tabs>

        {message ? <p className="text-center text-sm text-primary">{message}</p> : null}
        {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
