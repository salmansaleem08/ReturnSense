import { apiError, apiSuccess, corsHeaders, withAuth } from "@/lib/api/response";
import { updateOutcome } from "@/lib/db/buyers";

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export const POST = withAuth(async ({ req, user }) => {
  try {
    const { buyer_id, outcome, notes } = await req.json();
    const validOutcomes = ["delivered", "returned", "fake", "cancelled"];
    if (!validOutcomes.includes(outcome)) {
      return apiError("Invalid outcome", 400);
    }

    const buyer = await updateOutcome(buyer_id, user.id, outcome, notes);

    return apiSuccess({ success: true, buyer_id: buyer.id, outcome: buyer.outcome });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not mark outcome";
    return apiError(message, 500);
  }
});
