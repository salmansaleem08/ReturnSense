"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

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
    <nav
      style={{
        position: "sticky",
        top: 0,
        zIndex: 100,
        background: "var(--ig-surface, #FFFFFF)",
        borderBottom: "var(--border, 1px solid #DBDBDB)",
        height: "54px"
      }}
    >
      <div
        style={{
          maxWidth: "935px",
          margin: "0 auto",
          padding: "0 20px",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between"
        }}
      >
        <Link href="/dashboard" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <div
            style={{
              width: "32px",
              height: "32px",
              background: "var(--ig-text-primary, #262626)",
              borderRadius: "8px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "white",
              fontWeight: 700,
              fontSize: "18px",
              letterSpacing: "-0.5px",
              fontFamily: "Georgia, serif"
            }}
          >
            R
          </div>
          <span
            style={{
              fontWeight: 600,
              fontSize: "16px",
              color: "var(--ig-text-primary, #262626)",
              letterSpacing: "-0.3px"
            }}
          >
            ReturnSense
          </span>
        </Link>

        <div style={{ display: "flex", alignItems: "center", gap: "4px", flexWrap: "wrap", justifyContent: "center" }}>
          {NAV_ITEMS.map((item) => {
            const active = pathname === item.href || (pathname?.startsWith(item.href + "/") ?? false);
            return (
              <Link
                key={item.href}
                href={item.href}
                style={{
                  padding: "6px 12px",
                  borderRadius: "var(--radius-md, 8px)",
                  fontSize: "var(--text-base, 14px)",
                  fontWeight: active ? 600 : 400,
                  color: active ? "var(--ig-text-primary, #262626)" : "var(--ig-text-secondary, #737373)",
                  background: active ? "var(--ig-border-light, #EFEFEF)" : "transparent",
                  transition: "all 0.15s"
                }}
              >
                {item.label}
              </Link>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            type="button"
            onClick={() => void handleSignOut()}
            style={{
              background: "none",
              border: "var(--border, 1px solid #DBDBDB)",
              borderRadius: "var(--radius-md, 8px)",
              padding: "6px 14px",
              fontSize: "var(--text-sm, 12px)",
              color: "var(--ig-text-secondary, #737373)",
              fontWeight: 500
            }}
          >
            Sign out
          </button>
        </div>
      </div>
    </nav>
  );
}
