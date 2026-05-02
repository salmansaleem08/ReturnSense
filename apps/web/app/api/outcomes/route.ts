import { apiError, apiSuccess, corsHeaders, withAuth } from "@/lib/api/response";
import { updateOutcome } from "@/lib/db/buyers";
import { recordNetworkOutcome } from "@/lib/network/network-layer";
import { applyOutcomeLearning } from "@/lib/network/signal-learning";

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

    await recordNetworkOutcome({
      buyerId: String(buyer.id),
      sellerId: user.id,
      instagramUsername: String(buyer.instagram_username ?? ""),
      phoneNumber: buyer.phone_number != null ? String(buyer.phone_number) : null,
      outcome
    });

    await applyOutcomeLearning(String(buyer.id), outcome).catch((e) =>
      console.warn("[RS-LEARN] signal learning skipped:", e)
    );

    return apiSuccess({ success: true, buyer_id: buyer.id, outcome: buyer.outcome });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not mark outcome";
    return apiError(message, 500);
  }
});
