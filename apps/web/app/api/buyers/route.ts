import { apiError, apiSuccess, corsHeaders, withAuth } from "@/lib/api/response";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export const GET = withAuth(async ({ req, user }) => {
  try {
    const { searchParams } = new URL(req.url);
    const page = Number(searchParams.get("page") ?? "1");
    const limit = Number(searchParams.get("limit") ?? "20");
    const riskLevel = searchParams.get("risk_level");
    const outcome = searchParams.get("outcome");
    const search = searchParams.get("search");
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = supabaseAdmin
      .from("buyers")
      .select("*", { count: "exact" })
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (riskLevel) query = query.eq("final_risk_level", riskLevel);
    if (outcome) query = query.eq("outcome", outcome);
    if (search) query = query.ilike("instagram_username", `%${search}%`);

    const { data, error, count } = await query;
    if (error) throw error;

    return apiSuccess(
      {
        page,
        limit,
        total: count ?? 0,
        items: data ?? []
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch buyers";
    return apiError(message, 500);
  }
});
