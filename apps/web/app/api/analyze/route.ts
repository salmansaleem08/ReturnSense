import { analyzeWithGemini } from "@/lib/ai/gemini";
import { getHistoricalData, saveBuyer, saveSignals } from "@/lib/db/buyers";
import { checkQuota, incrementUsage } from "@/lib/db/profiles";
import { computeFinalScore } from "@/lib/risk/score-engine";
import { validateAddress } from "@/lib/validation/address";
import { validatePhone } from "@/lib/validation/phone";
import { createClient } from "@supabase/supabase-js";
import { getSupabasePublicKey, getSupabaseUrl } from "@/lib/supabase/config";

const corsHeaders = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization"
};

function formatChatForStorage(messages: Array<{ role: string; text: string }>) {
  return messages.map((m) => `[${m.role.toUpperCase()}] ${m.text}`).join("\n").slice(0, 12000);
}

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
      data: { user },
      error
    } = await supabase.auth.getUser(token);
    if (error || !user) {
      return Response.json({ error: "Unauthorized" }, { status: 401, headers: corsHeaders });
    }

    const { messages, username, phone, address } = await req.json();
    if (!messages || messages.length < 2 || !username) {
      return Response.json({ error: "Not enough chat data" }, { status: 400, headers: corsHeaders });
    }

    const quota = await checkQuota(user.id);
    if (!quota.allowed) {
      return Response.json({ error: "Monthly limit reached. Upgrade plan." }, { status: 429, headers: corsHeaders });
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

    return Response.json(
      {
        buyer_id: buyer.id,
        trust_score: finalScore,
        risk_level: riskLevel,
        ai_reasons: aiResult.ai_reasons ?? aiResult.reasons ?? [],
        signals,
        phone_analysis: phoneResult,
        address_analysis: addressResult,
        dashboard_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/buyers/${buyer.id}`
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Analysis failed";
    return Response.json({ error: message }, { status: 500, headers: corsHeaders });
  }
}
