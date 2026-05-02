import Link from "next/link";

import { PageAmbientBg } from "@/components/layout/page-ambient";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFoundPage() {
  return (
    <div className="rs-page-ambient flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <PageAmbientBg />
      <div className="relative z-10 max-w-xl rounded-2xl border border-border bg-card px-10 py-12 text-center">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">404</p>
          <h1 className="mt-3 text-2xl font-semibold text-foreground md:text-3xl">Page not found</h1>
          <p className="mt-3 text-sm text-muted-foreground">The page you are looking for does not exist or was moved.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
              Home
            </Link>
            <Link href="/dashboard" className={cn(buttonVariants())}>
              Dashboard
            </Link>
          </div>
      </div>
    </div>
  );
}
