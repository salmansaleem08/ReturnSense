"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DialogClose,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger
} from "@/components/ui/dialog";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { UsageQuotaChart } from "@/components/settings/usage-quota-chart";

export default function SettingsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("—");
  const [name, setName] = useState("—");
  const [plan, setPlan] = useState("free");
  const [analysesUsed, setAnalysesUsed] = useState(0);
  const [analysesLimit, setAnalysesLimit] = useState(20);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const session = data.session;
      if (!session?.user) return;
      setEmail(session.user.email ?? "—");
      setName((session.user.user_metadata?.full_name as string) ?? "—");
      const { data: profile } = await supabase
        .from("profiles")
        .select("plan,analyses_used,analyses_limit")
        .eq("id", session.user.id)
        .maybeSingle();
      if (profile) {
        setPlan(profile.plan);
        setAnalysesUsed(profile.analyses_used ?? 0);
        setAnalysesLimit(profile.analyses_limit ?? 20);
      }
    });
  }, [supabase]);

  const usagePercent = Math.min(100, Math.round((analysesUsed / Math.max(analysesLimit, 1)) * 100));

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 motion-safe:animate-[rs-fade-in_0.4s_ease-out]">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
          <span className="rs-text-gradient">Settings</span>
        </h1>
        <p className="text-sm text-muted-foreground">Account details, analysis quota, and the Chrome extension</p>
      </header>

      <Card className="rs-card-elevated rounded-[var(--radius-md)] border-border shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Account</CardTitle>
          <CardDescription>Profile and plan for this seller account.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Email</p>
            <p className="mt-0.5 font-medium text-foreground">{email}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Name</p>
            <p className="mt-0.5 font-medium text-foreground">{name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Plan</p>
            <Badge variant="secondary" className="mt-0.5 capitalize">
              {plan}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card className="rs-card-elevated rounded-[var(--radius-md)] border-border shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Monthly usage</CardTitle>
          <CardDescription>AI analyses count toward your monthly quota.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-6 sm:grid-cols-[1fr_200px] sm:items-center">
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>
                  {analysesUsed} / {analysesLimit} analyses
                </span>
                <span className="font-semibold text-foreground">{usagePercent}%</span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${usagePercent}%`,
                    background: "linear-gradient(90deg, hsl(var(--rs-g1)), hsl(var(--rs-g2)), hsl(var(--rs-g3)))"
                  }}
                />
              </div>
            </div>
            <div className="mx-auto w-full max-w-[200px] sm:max-w-none">
              <UsageQuotaChart used={analysesUsed} limit={analysesLimit} />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rs-card-elevated rounded-[var(--radius-md)] border-border shadow-none">
        <CardHeader>
          <CardTitle className="text-base">Chrome extension</CardTitle>
          <CardDescription>
            The extension uses the same Supabase account. Sign in from the extension popup with your email and
            password — no manual API tokens.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed text-muted-foreground">
          <ol className="list-decimal space-y-2 pl-5 text-foreground/90">
            <li>Open the ReturnSense extension popup (puzzle icon → ReturnSense).</li>
            <li>
              Log in with the <strong>same credentials</strong> as this dashboard.
            </li>
            <li>Sessions refresh automatically in the background so you stay signed in.</li>
          </ol>
          <p className="text-xs text-muted-foreground">
            Configure <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px]">extension/popup-config.js</code>{" "}
            (copy from <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-[11px]">apps/web/.env.local</code>) with
            project URL and publishable key — never commit that file.
          </p>
        </CardContent>
      </Card>

      <Card className="border border-destructive/25 bg-destructive/5 shadow-none dark:bg-destructive/10">
        <CardHeader>
          <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
          <CardDescription>Destructive actions for your account.</CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog>
            <DialogTrigger render={<Button variant="destructive" />}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete account
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete account?</DialogTitle>
                <DialogDescription>This cannot be undone. Contact support if you need help exporting data.</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                <Button variant="destructive" onClick={() => setMessage("Account deletion is not enabled yet.")}>
                  Confirm
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {message ? <p className="mt-3 text-sm text-amber-700">{message}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}
