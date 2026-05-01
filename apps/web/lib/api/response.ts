import { createClient } from "@supabase/supabase-js";

import { getSupabasePublicKey, getSupabaseUrl } from "@/lib/supabase/config";

export const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

export function apiSuccess(data: unknown, status = 200) {
  return Response.json(data, { status, headers: corsHeaders });
}

export function apiError(message: string, status = 400) {
  return Response.json({ error: message }, { status, headers: corsHeaders });
}

type HandlerContext = {
  req: Request;
  user: { id: string; email?: string | null };
};

type AuthHandler = (ctx: HandlerContext) => Promise<Response>;

export function withAuth(handler: AuthHandler) {
  return async (req: Request) => {
    try {
      const authHeader = req.headers.get("authorization");
      const token = authHeader?.replace("Bearer ", "");
      if (!token) return apiError("Unauthorized", 401);

      const supabase = createClient(getSupabaseUrl(), getSupabasePublicKey());
      const {
        data: { user }
      } = await supabase.auth.getUser(token);

      if (!user) return apiError("Unauthorized", 401);
      return handler({ req, user: { id: user.id, email: user.email } });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected API error";
      return apiError(message, 500);
    }
  };
}
