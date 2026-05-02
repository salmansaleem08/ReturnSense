"use client";

import { useEffect } from "react";
import Link from "next/link";

import { PageAmbientBg } from "@/components/layout/page-ambient";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="rs-page-ambient flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <PageAmbientBg />
      <div className="rs-gradient-border relative z-10 max-w-lg rounded-2xl p-[1px]">
        <div className="rounded-2xl bg-card px-8 py-10 text-center shadow-lg">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Error</p>
          <h2 className="mt-2 text-xl font-bold md:text-2xl">
            <span className="rs-text-gradient">Something went wrong</span>
          </h2>
          <p className="mt-3 text-sm text-muted-foreground">Please retry. If this persists, contact support.</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Button onClick={() => reset()}>Try again</Button>
            <Link href="/dashboard" className={cn(buttonVariants({ variant: "outline" }))}>
              Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
