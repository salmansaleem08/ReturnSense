"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [pendingGoogle, setPendingGoogle] = useState(false);
  const [pendingOtp, setPendingOtp] = useState(false);
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

  async function handleOtp() {
    setPendingOtp(true);
    setMessage(null);
    setError(null);
    const origin = window.location.origin;
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=/dashboard`
      }
    });
    if (otpError) {
      setError(otpError.message);
    } else {
      setMessage("Check your email for the one-time sign-in link.");
    }
    setPendingOtp(false);
  }

  return (
    <Card className="w-full max-w-[400px] rounded-[var(--radius-lg)] border border-border bg-card shadow-ig dark:shadow-ig-dark">
      <CardHeader className="space-y-4 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#FCAF45] via-[#E1306C] to-[#833AB4] text-lg font-bold text-white">
          RS
        </div>
        <div>
          <CardTitle className="text-base font-semibold leading-snug">ReturnSense</CardTitle>
          <CardDescription className="text-sm text-muted-foreground">
            Sign in to manage buyer risk intelligence.
          </CardDescription>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          onClick={handleGoogle}
          className="h-8 w-full rounded-[var(--radius-sm)] font-semibold"
          disabled={pendingGoogle}
        >
          {pendingGoogle ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Sign in with Google
        </Button>

        <Tabs defaultValue="email" className="w-full">
          <TabsList className="grid h-9 w-full grid-cols-1 rounded-[var(--radius-sm)] bg-muted p-1">
            <TabsTrigger value="email" className="rounded-[var(--radius-xs)] font-semibold">
              Email
            </TabsTrigger>
          </TabsList>
          <TabsContent value="email" className="space-y-3 pt-3">
            <Input
              type="email"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="h-10"
            />
            <Button
              onClick={handleOtp}
              disabled={pendingOtp || !email}
              variant="secondary"
              className="h-8 w-full rounded-[var(--radius-sm)] border border-border font-semibold"
            >
              {pendingOtp ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Send OTP Link
            </Button>
          </TabsContent>
        </Tabs>

        {message ? <p className="text-center text-sm text-[hsl(var(--primary))]">{message}</p> : null}
        {error ? <p className="text-center text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card>
  );
}
