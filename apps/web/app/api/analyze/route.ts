import { analyzeWithGemini } from "@/lib/ai/gemini";
import { buyerRowPayloadFromAi } from "@/lib/ai/openrouter";
import { logServerError } from "@/lib/api/log-server-error";
import { apiError, corsHeaders, withAuth } from "@/lib/api/response";
import { getHistoricalData, saveBuyer, saveSignals } from "@/lib/db/buyers";
import { checkQuota, incrementUsage } from "@/lib/db/profiles";
import { computeFinalScore } from "@/lib/risk/score-engine";
import type { AddressResult } from "@/lib/validation/address";
import { validateAddress } from "@/lib/validation/address";
import type { PhoneResult } from "@/lib/validation/phone";
import { validatePhone } from "@/lib/validation/phone";

/** Only columns that exist on `public.buyers` — PostgREST rejects unknown keys. */
function buyerPhoneDb(p: PhoneResult & { phone_valid: boolean }) {
  return {
    phone_valid: p.phone_valid,
    phone_carrier: p.phone_carrier ?? null,
    phone_is_voip: p.phone_is_voip ?? null,
    phone_country: p.phone_country ?? null
  };
}

function buyerAddressDb(a: AddressResult) {
  return {
    address_formatted: a.address_formatted,
    address_lat: a.address_lat,
    address_lng: a.address_lng,
    address_city: a.address_city,
    address_province: a.address_province ?? null,
    address_country: a.address_country,
    address_quality_score: a.address_quality_score
  };
}

function formatChatForStorage(messages: Array<{ role: string; text: string }>) {
  return messages.map((m) => `[${m.role.toUpperCase()}] ${m.text}`).join("\n").slice(0, 12000);
}

/** Instagram fallback often sends one transcript blob; Gemini still needs a turn structure. */
function normalizeMessages(messages: Array<{ role: string; text: string }> | null | undefined) {
  if (!messages?.length) return [];
  if (messages.length >= 2) return messages;
  const text = (messages[0]?.text ?? "").trim();
  if (text.length >= 80) {
    let segments = text
      .split(/\n{2,}/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 3);
    if (segments.length < 2) {
      segments = text
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => s.length >= 3);
    }
    if (segments.length >= 2) {
      return segments.map((chunk, i) => ({
        role: i % 2 === 0 ? "buyer" : "seller",
        text: chunk
      }));
    }
    const mid = Math.floor(text.length / 2);
    return [
      { role: messages[0]?.role || "buyer", text: text.slice(0, mid).trim() },
      { role: "seller", text: text.slice(mid).trim() }
    ];
  }
  if (messages.length === 1 && text.length > 0) {
    return [
      { role: messages[0]?.role || "buyer", text },
      { role: "seller", text: "[No additional messages captured in thread]" }
    ];
  }
  return messages;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export const POST = withAuth(async ({ req, user }) => {
  try {
    const body = await req.json();
    const rawBody = body as {
      messages?: Array<{ role: string; text: string }>;
      username?: string;
      phone?: string | null;
      address?: string | null;
    };
    let { messages, username } = rawBody;
    const phoneStr = rawBody.phone == null ? "" : String(rawBody.phone).trim();
    const addressStr = rawBody.address == null ? "" : String(rawBody.address).trim();
    username = typeof username === "string" && username.trim().length ? username.trim() : "unknown_buyer";
    messages = normalizeMessages(messages);
    if (!messages || messages.length < 2) {
      return apiError("Not enough chat data", 400);
    }

    const quota = await checkQuota(user.id, user.email);
    if (!quota.allowed) {
      return apiError("Monthly limit reached. Upgrade plan.", 429);
    }

    const historicalData = await getHistoricalData(phoneStr || null, username);

    const phoneNotProvided: PhoneResult = {
      phone_valid: null,
      phone_carrier: null,
      phone_is_voip: null,
      phone_type: null,
      phone_country: null,
      phone_international_format: null,
      phone_local_format: null,
      phone_number: null,
      configured: true,
      not_provided: true,
      error: null
    };

    const [phoneResult, addressResult] = await Promise.all([
      phoneStr ? validatePhone(phoneStr) : Promise.resolve(phoneNotProvided),
      validateAddress(addressStr || "")
    ]);

    const aiResult = await analyzeWithGemini(messages, username);

    const { finalScore, riskLevel, signals } = computeFinalScore({
      aiResult,
      phoneResult,
      addressResult,
      historicalData
    });

    const phoneDbPayload =
      phoneResult?.configured === true && typeof phoneResult.phone_valid === "boolean"
        ? buyerPhoneDb(phoneResult as PhoneResult & { phone_valid: boolean })
        : {};

    const addressDbPayload = addressResult?.configured === true ? buyerAddressDb(addressResult) : {};

    const buyer = await saveBuyer({
      seller_id: user.id,
      instagram_username: username,
      phone_number: phoneStr || null,
      address_raw: addressStr || null,
      ...phoneDbPayload,
      ...addressDbPayload,
      ...buyerRowPayloadFromAi(aiResult),
      final_trust_score: finalScore,
      final_risk_level: riskLevel,
      chat_snapshot: formatChatForStorage(messages)
    });

    await saveSignals(buyer.id, signals);
    await incrementUsage(user.id, user.email);

    const raw = aiResult.ai_raw_response as Record<string, unknown> | undefined;

    return Response.json(
      {
        buyer_id: buyer.id,
        trust_score: finalScore,
        risk_level: riskLevel,
        analyst_notes: (raw?.analyst_notes as string | undefined) ?? aiResult.analyst_notes ?? null,
        ai_reasons: aiResult.ai_reasons ?? [],
        positive_signals: aiResult.positive_signals ?? [],
        negative_signals: aiResult.negative_signals ?? [],
        recommendation: aiResult.recommendation ?? "caution",
        buyer_seriousness: aiResult.ai_buyer_seriousness ?? null,
        commitment_confirmed: Boolean(raw?.commitment_confirmed),
        communication_quality: (raw?.communication_quality as string | null | undefined) ?? null,
        phone_analysis: phoneResult,
        address_analysis: addressResult,
        historical_data: historicalData ?? [],
        signals,
        dashboard_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/buyers/${buyer.id}`
      },
      { headers: corsHeaders }
    );
  } catch (err) {
    logServerError("POST /api/analyze", err);
    const message = err instanceof Error ? err.message : "Analysis failed";
    return apiError(message, 500);
  }
});
