import { analyzeWithGemini } from "@/lib/ai/gemini";
import { logServerError } from "@/lib/api/log-server-error";
import { apiError, apiSuccess, corsHeaders, withAuth } from "@/lib/api/response";
import { getHistoricalData, saveBuyer, saveSignals } from "@/lib/db/buyers";
import { checkQuota, incrementUsage } from "@/lib/db/profiles";
import { computeFinalScore } from "@/lib/risk/score-engine";
import { validateAddress } from "@/lib/validation/address";
import { validatePhone } from "@/lib/validation/phone";

function formatChatForStorage(messages: Array<{ role: string; text: string }>) {
  return messages.map((m) => `[${m.role.toUpperCase()}] ${m.text}`).join("\n").slice(0, 12000);
}

/** Instagram fallback often sends one transcript blob; Gemini still needs a turn structure. */
function normalizeMessages(messages: Array<{ role: string; text: string }> | null | undefined) {
  if (!messages?.length) return [];
  if (messages.length >= 2) return messages;
  const text = (messages[0]?.text ?? "").trim();
  if (text.length < 80) return messages;

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

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export const POST = withAuth(async ({ req, user }) => {
  try {
    const body = await req.json();
    let { messages, username, phone, address } = body;
    username = typeof username === "string" && username.trim().length ? username.trim() : "unknown_buyer";
    messages = normalizeMessages(messages);
    if (!messages || messages.length < 2) {
      return apiError("Not enough chat data", 400);
    }

    const quota = await checkQuota(user.id);
    if (!quota.allowed) {
      return apiError("Monthly limit reached. Upgrade plan.", 429);
    }

    const [phoneResult, addressResult] = await Promise.all([
      phone ? validatePhone(phone) : Promise.resolve(null),
      address ? validateAddress(address) : Promise.resolve(null)
    ]);

    const aiResult = await analyzeWithGemini(messages, username);

    const { finalScore, riskLevel, signals } = computeFinalScore({
      aiResult,
      phoneResult,
      addressResult,
      historicalData: await getHistoricalData(phone, username)
    });

    const buyer = await saveBuyer({
      seller_id: user.id,
      instagram_username: username,
      phone_number: phone,
      address_raw: address,
      ...(phoneResult ?? {}),
      ...(addressResult ?? {}),
      ...aiResult,
      final_trust_score: finalScore,
      final_risk_level: riskLevel,
      chat_snapshot: formatChatForStorage(messages)
    });

    await saveSignals(buyer.id, signals);
    await incrementUsage(user.id);

    return apiSuccess(
      {
        buyer_id: buyer.id,
        trust_score: finalScore,
        risk_level: riskLevel,
        ai_reasons: aiResult.ai_reasons,
        signals,
        phone_analysis: phoneResult,
        address_analysis: addressResult,
        dashboard_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/buyers/${buyer.id}`
      }
    );
  } catch (err) {
    logServerError("POST /api/analyze", err);
    const message = err instanceof Error ? err.message : "Analysis failed";
    return apiError(message, 500);
  }
});
