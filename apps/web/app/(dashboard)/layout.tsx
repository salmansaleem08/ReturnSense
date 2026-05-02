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
    <div className="min-h-screen bg-background">
      <TopNav />
      <main className="rs-dashboard-main motion-safe:animate-[rs-fade-in_0.35s_ease-out] w-full max-w-full px-4 py-7 sm:px-6 lg:px-12 lg:pb-12">
        {children}
      </main>
    </div>
  );
}
