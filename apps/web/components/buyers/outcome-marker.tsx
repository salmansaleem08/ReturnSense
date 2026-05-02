"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { pushToast } from "@/components/ui/toaster";

const outcomeOptions = [
  { id: "delivered", label: "Delivered" },
  { id: "returned", label: "Returned" },
  { id: "fake", label: "Fake Order" },
  { id: "cancelled", label: "Cancelled" }
] as const;

export function OutcomeMarker({
  buyerId,
  currentOutcome,
  outcomeMarkedAt
}: {
  buyerId: string;
  currentOutcome: string;
  outcomeMarkedAt: string | null;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function markOutcome(outcome: (typeof outcomeOptions)[number]["id"]) {
    setLoading(true);
    setError(null);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("No active session");

      const res = await fetch("/api/outcomes", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ buyer_id: buyerId, outcome, notes })
      });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || "Failed to update");
      pushToast({ title: "Outcome updated", description: `Buyer marked as ${outcome}.` });
      router.refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Unexpected error";
      setError(message);
      pushToast({ title: "Failed to update outcome", description: message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <h3 className="mb-2 text-sm font-semibold text-slate-500">Outcome Marking</h3>
      <p className="text-sm">
        Current: <span className="font-semibold capitalize">{currentOutcome}</span>
      </p>
      {outcomeMarkedAt ? <p className="text-xs text-slate-500">Marked at: {new Date(outcomeMarkedAt).toLocaleString()}</p> : null}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {outcomeOptions.map((option) => (
          <Button key={option.id} disabled={loading} onClick={() => markOutcome(option.id)} variant="outline">
            {option.label}
          </Button>
        ))}
      </div>
      <Input
        className="mt-3"
        placeholder="Optional note"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
      />
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
    </div>
  );
}
