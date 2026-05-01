import { createClient } from "@supabase/supabase-js";

import { updateOutcome } from "@/lib/db/buyers";
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

export async function POST(req: Request) {
  try {
    const token = req.headers.get("authorization")?.replace("Bearer ", "");
    if (!token) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    }

    const supabase = createClient(getSupabaseUrl(), getSupabasePublicKey());
    const {
      data: { user }
    } = await supabase.auth.getUser(token);
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    }

    const { buyer_id, outcome, notes } = await req.json();
    const validOutcomes = ["delivered", "returned", "fake", "cancelled"];
    if (!validOutcomes.includes(outcome)) {
      return Response.json({ error: "Invalid outcome" }, { status: 400, headers: corsHeaders });
    }

    const buyer = await updateOutcome(buyer_id, user.id, outcome, notes);

    return Response.json({ success: true, buyer_id: buyer.id, outcome: buyer.outcome }, { headers: corsHeaders });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not mark outcome";
    return Response.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}
