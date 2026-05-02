import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import { BuyerTable } from "@/components/buyers/buyer-table";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getSupabasePublicKey, getSupabaseUrl } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/server";

export default async function BuyersPage({
  searchParams
}: {
  searchParams: { page?: string; limit?: string; risk_level?: string; outcome?: string; search?: string };
}) {
  const page = Number(searchParams.page ?? "1");
  const limit = Number(searchParams.limit ?? "20");
  const riskLevel = searchParams.risk_level ?? "";
  const outcome = searchParams.outcome ?? "";
  const search = searchParams.search ?? "";

  const cookieStore = cookies();
  const supabase = createServerClient(getSupabaseUrl(), getSupabasePublicKey(), {
    cookies: { getAll: () => cookieStore.getAll(), setAll: () => {} }
  });

  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return null;

  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabaseAdmin
    .from("buyers")
    .select("*", { count: "exact" })
    .eq("seller_id", user.id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (riskLevel) query = query.eq("final_risk_level", riskLevel);
  if (outcome) query = query.eq("outcome", outcome);
  if (search) query = query.ilike("instagram_username", `%${search}%`);

  const { data, count } = await query;
  const items = data ?? [];
  const total = count ?? 0;

  return (
    <div className="space-y-5">
      <form className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 md:grid-cols-5">
        <Input name="search" placeholder="Search username" defaultValue={search} />
        <select name="risk_level" defaultValue={riskLevel} className="rs-select">
          <option value="">All Risk Levels</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
          <option value="critical">Critical</option>
        </select>
        <select name="outcome" defaultValue={outcome} className="rs-select">
          <option value="">All Outcomes</option>
          <option value="pending">Pending</option>
          <option value="delivered">Delivered</option>
          <option value="returned">Returned</option>
          <option value="fake">Fake</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <input type="hidden" name="page" value="1" />
        <input type="hidden" name="limit" value={String(limit)} />
        <Button type="submit">Apply Filters</Button>
      </form>

      <BuyerTable items={items} page={page} limit={limit} total={total} />
    </div>
  );
}
