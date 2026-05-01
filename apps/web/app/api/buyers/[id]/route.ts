import { createClient } from "@supabase/supabase-js";

import { getBuyerById } from "@/lib/db/buyers";
import { getSupabasePublicKey, getSupabaseUrl } from "@/lib/supabase/config";

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    const supabase = createClient(getSupabaseUrl(), getSupabasePublicKey());
    const {
      data: { user }
    } = await supabase.auth.getUser(token);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });

    const buyer = await getBuyerById(params.id, user.id);
    return Response.json(buyer, { headers: corsHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch buyer";
    return Response.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}
