"use client";

import { useEffect, useState } from "react";
import { Toast, ToastClose, ToastDescription, ToastProvider, ToastTitle, ToastViewport } from "@/components/ui/toast";

type ToastEvent = {
  title: string;
  description?: string;
  variant?: "default" | "destructive";
};

export function pushToast(event: ToastEvent) {
  window.dispatchEvent(new CustomEvent("rs-toast", { detail: event }));
}

export function Toaster() {
  const [open, setOpen] = useState(false);
  const [payload, setPayload] = useState<ToastEvent | null>(null);

  useEffect(() => {
    function onToast(event: Event) {
      const custom = event as CustomEvent<ToastEvent>;
      setPayload(custom.detail);
      setOpen(true);
    }
    window.addEventListener("rs-toast", onToast);
    return () => window.removeEventListener("rs-toast", onToast);
  }, []);

  return (
    <ToastProvider>
      <Toast open={open} onOpenChange={setOpen} variant={payload?.variant ?? "default"}>
        <div className="grid gap-1">
          <ToastTitle>{payload?.title}</ToastTitle>
          {payload?.description ? <ToastDescription>{payload.description}</ToastDescription> : null}
        </div>
        <ToastClose />
      </Toast>
      <ToastViewport />
    </ToastProvider>
  );
}
