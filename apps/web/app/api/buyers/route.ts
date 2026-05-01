import { createClient } from "@supabase/supabase-js";

import { getSupabasePublicKey, getSupabaseUrl } from "@/lib/supabase/config";
import { supabaseAdmin } from "@/lib/supabase/server";

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    const supabase = createClient(getSupabaseUrl(), getSupabasePublicKey());
    const {
      data: { user }
    } = await supabase.auth.getUser(token);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

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

    return Response.json(
      {
        page,
        limit,
        total: count ?? 0,
        items: data ?? []
      },
      { headers: corsHeaders }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch buyers";
    return Response.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}
