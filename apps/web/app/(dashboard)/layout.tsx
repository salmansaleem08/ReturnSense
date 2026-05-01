import { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerClient } from "@supabase/ssr";

import { DashboardShell } from "@/components/dashboard/dashboard-shell";
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
    <DashboardShell email={user.email ?? "seller@returnsense.com"} plan={profile?.plan ?? "free"}>
      {children}
    </DashboardShell>
  );
}
