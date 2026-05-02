"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, LayoutDashboard, LogOut, Menu, Settings, Users } from "lucide-react";
import { useMemo, useState } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/buyers", label: "Buyers", icon: Users },
  { href: "/dashboard/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/dashboard/settings", label: "Settings", icon: Settings }
];

interface DashboardShellProps {
  children: React.ReactNode;
  email: string;
  plan: string;
}

function SidebarNav({
  pathname,
  onNavigate
}: {
  pathname: string | null;
  onNavigate?: () => void;
}) {
  return (
    <nav className="flex flex-1 flex-col gap-1 px-3 pt-2" aria-label="Main navigation">
      {navItems.map((item) => {
        const active = pathname === item.href;
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "flex h-nav-item min-h-touch items-center gap-4 rounded-[var(--radius-md)] px-3 text-sm transition-colors",
              active
                ? "font-semibold text-foreground"
                : "font-normal text-foreground hover:bg-muted"
            )}
          >
            <Icon className="h-6 w-6 shrink-0 stroke-[1.75]" aria-hidden />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function DashboardShell({ children, email, plan }: DashboardShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const initials = useMemo(() => email?.slice(0, 2).toUpperCase() ?? "RS", [email]);

  async function handleLogout() {
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const closeMobile = () => setMobileOpen(false);

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile header — Instagram-style thin bar */}
      <header className="sticky top-0 z-40 flex h-[52px] items-center justify-between border-b border-border bg-background px-4 md:hidden">
        <Link href="/dashboard" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <span
            className="flex h-8 w-8 items-center justify-center rounded-xs bg-gradient-to-br from-[#FCAF45] via-[#E1306C] to-[#833AB4] text-[11px] font-bold text-white"
            aria-hidden
          >
            RS
          </span>
          ReturnSense
        </Link>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-touch min-w-touch rounded-[var(--radius-md)]"
          aria-label="Open menu"
          onClick={() => setMobileOpen(true)}
        >
          <Menu className="h-6 w-6" />
        </Button>
      </header>

      {/* Desktop sidebar — fixed 245px */}
      <aside
        className="fixed inset-y-0 left-0 z-30 hidden w-sidebar flex-col border-r border-border bg-background md:flex"
        aria-hidden={false}
      >
        <div className="flex h-[52px] shrink-0 items-center px-6 pt-4">
          <Link href="/dashboard" className="flex items-center gap-2 text-xl font-semibold tracking-tight">
            <span
              className="flex h-9 w-9 items-center justify-center rounded-xs bg-gradient-to-br from-[#FCAF45] via-[#E1306C] to-[#833AB4] text-xs font-bold text-white"
              aria-hidden
            >
              RS
            </span>
            <span className="hidden lg:inline">ReturnSense</span>
          </Link>
        </div>
        <SidebarNav pathname={pathname} />
        <div className="mt-auto border-t border-border p-4">
          <div className="flex items-center gap-3 px-2">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-foreground"
              aria-hidden
            >
              {initials}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs text-muted-foreground">{email}</p>
              <Badge variant="secondary" className="mt-1 capitalize">
                {plan}
              </Badge>
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="mt-4 w-full rounded-[var(--radius-sm)] border-border font-semibold"
            onClick={handleLogout}
          >
            <LogOut className="mr-2 h-4 w-4" />
            Log out
          </Button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 md:hidden" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <button
            type="button"
            className="absolute inset-0 bg-black/65"
            aria-label="Close menu"
            onClick={closeMobile}
          />
          <aside className="absolute inset-y-0 left-0 flex w-[260px] max-w-[85vw] flex-col border-r border-border bg-background shadow-ig">
            <div className="flex h-[52px] items-center justify-between border-b border-border px-4">
              <span className="text-lg font-semibold">Menu</span>
              <Button type="button" variant="ghost" size="icon-sm" onClick={closeMobile} aria-label="Close">
                <span className="text-lg leading-none">×</span>
              </Button>
            </div>
            <SidebarNav pathname={pathname} onNavigate={closeMobile} />
            <div className="mt-auto border-t border-border p-4">
              <Button variant="outline" size="sm" className="w-full font-semibold" onClick={handleLogout}>
                <LogOut className="mr-2 h-4 w-4" />
                Log out
              </Button>
            </div>
          </aside>
        </div>
      ) : null}

      {/* Main — offset for desktop sidebar; max app width centered */}
      <main className="min-h-[calc(100vh-52px)] pb-nav-bottom md:ml-sidebar md:min-h-screen md:pb-0">
        <div className="mx-auto w-full max-w-ig px-4 py-6 md:px-6">{children}</div>
      </main>

      {/* Mobile bottom nav — 49px */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-30 flex h-nav-bottom items-stretch border-t border-border bg-background md:hidden"
        aria-label="Main navigation"
      >
        {navItems.map((item) => {
          const active = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={`mobile-${item.href}`}
              href={item.href}
              className={cn(
                "flex flex-1 flex-col items-center justify-center gap-0.5 pt-1 text-nav-mobile text-muted-foreground",
                active && "font-semibold text-foreground"
              )}
            >
              <Icon className={cn("h-6 w-6", active && "text-foreground")} strokeWidth={active ? 2.25 : 1.75} />
              <span className="max-w-[64px] truncate">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
