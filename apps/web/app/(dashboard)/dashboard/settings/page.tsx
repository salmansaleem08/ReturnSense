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
      <Card
        className="rounded-[var(--radius-md)] border-[#DBDBDB] shadow-none"
        style={{ background: "var(--ig-surface, #fff)" }}
      >
        <CardHeader>
          <CardTitle className="text-base" style={{ color: "var(--ig-text-primary)" }}>
            Account
          </CardTitle>
          <CardDescription>Profile and plan for this seller account.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs" style={{ color: "var(--ig-text-muted)" }}>
              Email
            </p>
            <p className="mt-0.5 font-medium" style={{ color: "var(--ig-text-primary)" }}>
              {email}
            </p>
          </div>
          <div>
            <p className="text-xs" style={{ color: "var(--ig-text-muted)" }}>
              Name
            </p>
            <p className="mt-0.5 font-medium" style={{ color: "var(--ig-text-primary)" }}>
              {name}
            </p>
          </div>
          <div>
            <p className="text-xs" style={{ color: "var(--ig-text-muted)" }}>
              Plan
            </p>
            <Badge variant="secondary" className="mt-0.5 capitalize">
              {plan}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card
        className="rounded-[var(--radius-md)] border-[#DBDBDB] shadow-none"
        style={{ background: "var(--ig-surface, #fff)" }}
      >
        <CardHeader>
          <CardTitle className="text-base" style={{ color: "var(--ig-text-primary)" }}>
            Monthly usage
          </CardTitle>
          <CardDescription>AI analyses count toward your monthly quota.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm" style={{ color: "var(--ig-text-secondary)" }}>
            <span>
              {analysesUsed} / {analysesLimit} analyses
            </span>
            <span className="font-medium">{usagePercent}%</span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "#EFEFEF" }}>
            <div
              className="h-2 rounded-full transition-all duration-500"
              style={{
                width: `${usagePercent}%`,
                background: "var(--ig-blue, #0095F6)"
              }}
            />
          </div>
        </CardContent>
      </Card>

      <Card
        className="rounded-[var(--radius-md)] border-[#DBDBDB] shadow-none"
        style={{ background: "var(--ig-surface, #fff)" }}
      >
        <CardHeader>
          <CardTitle className="text-base" style={{ color: "var(--ig-text-primary)" }}>
            Chrome extension
          </CardTitle>
          <CardDescription>
            The extension uses the same Supabase account. Sign in from the extension popup with your email and
            password — no manual API tokens.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm leading-relaxed" style={{ color: "var(--ig-text-secondary)" }}>
          <ol className="list-decimal space-y-2 pl-5">
            <li>Open the ReturnSense extension popup (puzzle icon → ReturnSense).</li>
            <li>
              Log in with the <strong>same credentials</strong> as this dashboard.
            </li>
            <li>Sessions refresh automatically in the background so you stay signed in.</li>
          </ol>
          <p className="text-xs" style={{ color: "var(--ig-text-muted)" }}>
            Configure <code className="rounded bg-[#FAFAFA] px-1 py-0.5">extension/popup-config.js</code> (copy from{" "}
            <code className="rounded bg-[#FAFAFA] px-1 py-0.5">apps/web/.env.local</code>) with project URL and
            publishable key — never commit that file.
          </p>
        </CardContent>
      </Card>

      <Card className="border-red-200 shadow-none">
        <CardHeader>
          <CardTitle className="text-base text-red-700">Danger zone</CardTitle>
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
