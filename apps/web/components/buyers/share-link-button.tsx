"use client";

import { Button } from "@/components/ui/button";
import { pushToast } from "@/components/ui/toaster";

export function ShareLinkButton() {
  async function copyLink() {
    await navigator.clipboard.writeText(window.location.href);
    pushToast({ title: "Share link copied", description: "Buyer report link copied to clipboard." });
  }

  return (
    <Button className="w-full" variant="outline" onClick={copyLink}>
      Copy Share Link
    </Button>
  );
}
