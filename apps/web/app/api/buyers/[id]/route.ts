import { apiError, apiSuccess, corsHeaders, withAuth } from "@/lib/api/response";
import { getBuyerById } from "@/lib/db/buyers";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export async function GET(req: Request, { params }: { params: { id: string } }) {
  return withAuth(async ({ user }) => {
    try {
      const buyer = await getBuyerById(params.id, user.id);
      return apiSuccess(buyer);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to fetch buyer";
      return apiError(message, 500);
    }
  })(req);
}
