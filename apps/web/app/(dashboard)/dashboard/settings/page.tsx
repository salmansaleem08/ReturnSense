"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, RefreshCw, Trash2 } from "lucide-react";

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
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SettingsPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [email, setEmail] = useState("seller@returnsense.com");
  const [name, setName] = useState("Seller");
  const [plan, setPlan] = useState("free");
  const [analysesUsed, setAnalysesUsed] = useState(0);
  const [analysesLimit, setAnalysesLimit] = useState(20);
  const [extensionToken, setExtensionToken] = useState("");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      const session = data.session;
      if (!session?.user) return;
      setEmail(session.user.email ?? "seller@returnsense.com");
      setName((session.user.user_metadata?.full_name as string) ?? "Seller");
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

  async function generateToken() {
    setMessage(null);
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token ?? "";
    setExtensionToken(token);
    setMessage(token ? "Extension token generated." : "No active session found.");
  }

  async function copyToken() {
    if (!extensionToken) return;
    await navigator.clipboard.writeText(extensionToken);
    setMessage("Token copied to clipboard.");
  }

  const usagePercent = Math.min(100, Math.round((analysesUsed / Math.max(analysesLimit, 1)) * 100));

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Account Info</CardTitle>
          <CardDescription>Manage your seller profile details.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-3">
          <div>
            <p className="text-xs text-muted-foreground">Email</p>
            <p className="font-medium">{email}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Name</p>
            <p className="font-medium">{name}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Plan</p>
            <Badge variant="secondary" className="capitalize">
              {plan}
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Plan & Usage</CardTitle>
          <CardDescription>Track monthly analysis quota usage.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span>
              {analysesUsed} / {analysesLimit} analyses used
            </span>
            <span>{usagePercent}%</span>
          </div>
          <div className="h-2 w-full rounded-full bg-slate-100">
            <div className="h-2 rounded-full bg-slate-900" style={{ width: `${usagePercent}%` }} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Extension Token</CardTitle>
          <CardDescription>Use this token inside the Chrome Extension for API access.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={generateToken}>
            <RefreshCw className="mr-2 h-4 w-4" />
            Generate Extension Token
          </Button>
          <div className="flex gap-2">
            <Input readOnly value={extensionToken} placeholder="Generate token to display it here" />
            <Button type="button" variant="outline" onClick={copyToken} disabled={!extensionToken}>
              <Copy className="mr-2 h-4 w-4" />
              Copy
            </Button>
          </div>
          <p className="text-sm text-amber-600">
            Token expires in 1 hour. Regenerate if extension stops working.
          </p>
          {message ? <p className="text-sm text-emerald-600">{message}</p> : null}
        </CardContent>
      </Card>

      <Card className="border-red-200">
        <CardHeader>
          <CardTitle className="text-red-700">Danger Zone</CardTitle>
          <CardDescription>Delete account actions are irreversible.</CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog>
            <DialogTrigger render={<Button variant="destructive" />}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Account
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete account?</DialogTitle>
                <DialogDescription>
                  This removes your account data permanently. Confirm only if you are sure.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                <Button variant="destructive" onClick={() => setMessage("Account deletion flow will be enabled next.")}>
                  Confirm Delete
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>
    </div>
  );
}
