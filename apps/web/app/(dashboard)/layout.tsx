import { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";

import { TopNav } from "@/components/TopNav";
import { supabaseAdmin } from "@/lib/supabase/server";
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

  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("plan")
    .eq("id", user.id)
    .maybeSingle();

  return (
    <div style={{ minHeight: "100vh", background: "var(--ig-bg, #FAFAFA)" }}>
      <TopNav />
      <main style={{ maxWidth: "935px", margin: "0 auto", padding: "30px 20px" }}>{children}</main>
    </div>
  );
}
