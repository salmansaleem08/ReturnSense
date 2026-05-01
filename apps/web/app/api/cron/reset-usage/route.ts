import { apiError, apiSuccess, corsHeaders } from "@/lib/api/response";
import { supabaseAdmin } from "@/lib/supabase/server";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(req: Request) {
  const token = req.headers.get("authorization");
  if (!token || token !== process.env.INTERNAL_SECRET) {
    return apiError("Unauthorized", 401);
  }

  const { error } = await supabaseAdmin.from("profiles").update({ analyses_used: 0 }).neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) return apiError(error.message, 500);
  return apiSuccess({ success: true, message: "Monthly usage reset complete." });
}
