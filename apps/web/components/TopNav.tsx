"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/theme-toggle";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "Buyers", href: "/dashboard/buyers" },
  { label: "Analytics", href: "/dashboard/analytics" },
  { label: "Settings", href: "/dashboard/settings" }
];

export function TopNav() {
  const pathname = usePathname();
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.push("/login");
  }

  return (
    <nav className="rs-z-nav-main sticky top-0 z-50 h-[54px] border-b border-border/80 bg-card/75 backdrop-blur-xl">
      <div className="mx-auto flex h-full max-w-ig items-center justify-between px-4 sm:px-5">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <span className="rs-logo-mark text-[13px]">R</span>
          <span className="rs-text-gradient text-base font-semibold tracking-tight">ReturnSense</span>
        </Link>

        <div className="flex flex-wrap items-center justify-center gap-1 sm:gap-0">
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || (pathname?.startsWith(item.href + "/") ?? false);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${
                  active
                    ? "rs-nav-active font-semibold text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            type="button"
            onClick={() => void handleSignOut()}
            className="rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted-foreground transition hover:bg-muted sm:text-sm"
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
