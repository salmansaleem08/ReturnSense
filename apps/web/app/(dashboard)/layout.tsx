import { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";

import { TopNav } from "@/components/TopNav";
import { getSupabasePublicKey, getSupabaseUrl } from "@/lib/supabase/config";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const cookieStore = cookies();
  const supabase = createServerClient(
    getSupabaseUrl(),
    getSupabasePublicKey(),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {}
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <div style={{ minHeight: "100vh", background: "var(--ig-bg, #FAFAFA)" }}>
      <TopNav />
      <main
        className="rs-dashboard-main motion-safe:animate-[rs-fade-in_0.35s_ease-out]"
        style={{
          width: "100%",
          maxWidth: "100%",
          margin: 0,
          padding: "28px clamp(16px, 4vw, 48px) 48px"
        }}
      >
        {children}
      </main>
    </div>
  );
}
