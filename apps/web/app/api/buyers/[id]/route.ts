import { createClient } from "@supabase/supabase-js";

import { apiError, apiSuccess, corsHeaders } from "@/lib/api/response";
import { getSupabasePublicKey, getSupabaseUrl } from "@/lib/supabase/config";
import { softDeleteBuyer } from "@/lib/db/buyers";

const deleteCors = {
  ...corsHeaders,
  "Access-Control-Allow-Methods": "DELETE, OPTIONS"
};

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: deleteCors });
}

export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  try {
    const authHeader = req.headers.get("authorization");
    const token = authHeader?.replace("Bearer ", "");
    if (!token) return apiError("Unauthorized", 401);

    const supabase = createClient(getSupabaseUrl(), getSupabasePublicKey());
    const {
      data: { user }
    } = await supabase.auth.getUser(token);
    if (!user) return apiError("Unauthorized", 401);

    const id = params?.id;
    if (!id) return apiError("Missing id", 400);

    await softDeleteBuyer(id, user.id);
    return apiSuccess({ deleted: true, buyer_id: id }, 200, deleteCors);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not delete analysis";
    return apiError(message, 500);
  }
}
