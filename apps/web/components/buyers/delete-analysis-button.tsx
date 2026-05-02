"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { pushToast } from "@/components/ui/toaster";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export function DeleteAnalysisButton({
  buyerId,
  compact,
  stopPropagation
}: {
  buyerId: string;
  compact?: boolean;
  /** Use on table rows so clicking Delete does not open the buyer detail page. */
  stopPropagation?: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [loading, setLoading] = useState(false);

  async function onDelete() {
    const explained =
      "Remove this analysis from your dashboard and analytics? " +
      "Outcomes you already reported stay in the anonymous network layer (hashed identifiers only) to protect other sellers. " +
      "This cannot be undone.";
    if (!confirm(explained)) return;
    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) throw new Error("No active session");

      const res = await fetch(`/api/buyers/${buyerId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` }
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(payload.error || "Delete failed");

      pushToast({ title: "Analysis removed", description: "It no longer appears in your workspace." });
      if (!compact) router.push("/dashboard/buyers");
      router.refresh();
    } catch (e) {
      pushToast({
        title: "Could not delete",
        description: e instanceof Error ? e.message : "Error",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      variant="destructive"
      size={compact ? "sm" : "default"}
      disabled={loading}
      className={compact ? "shrink-0" : ""}
      onClick={(e) => {
        if (stopPropagation) e.stopPropagation();
        void onDelete();
      }}
    >
      Delete analysis
    </Button>
  );
}
