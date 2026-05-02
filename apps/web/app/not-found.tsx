import Link from "next/link";

import { PageAmbientBg } from "@/components/layout/page-ambient";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default function NotFoundPage() {
  return (
    <div className="rs-page-ambient flex min-h-screen flex-col items-center justify-center bg-background px-4">
      <PageAmbientBg />
      <div className="rs-gradient-border relative z-10 max-w-xl rounded-2xl p-[1px]">
        <div className="rounded-2xl bg-card px-10 py-12 text-center shadow-lg">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">404</p>
          <h1 className="mt-3 text-2xl font-bold md:text-3xl">
            <span className="rs-text-gradient">Page not found</span>
          </h1>
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
    </div>
  );
}
