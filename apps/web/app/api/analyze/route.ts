import { createHash } from "crypto";

import { analyzeWithGemini } from "@/lib/ai/gemini";
import type { AiStructuredResult } from "@/lib/ai/openrouter";
import { buyerRowPayloadFromAi } from "@/lib/ai/openrouter";
import { synthesizeAnalystNarrative } from "@/lib/ai/tri/synthesize";
import { logServerError } from "@/lib/api/log-server-error";
import { getPublicAppUrl } from "@/lib/config/public-app-url";
import { apiError, corsHeaders, withAuth } from "@/lib/api/response";
import {
  findBuyerByConversationHash,
  getHistoricalData,
  listRiskSignalsForBuyer,
  saveBuyer,
  saveSignals
} from "@/lib/db/buyers";
import { checkQuota, incrementUsage } from "@/lib/db/profiles";
import { computeFinalScore } from "@/lib/risk/score-engine";
import type { AddressResult } from "@/lib/validation/address";
import { validateAddress } from "@/lib/validation/address";
import type { PhoneResult, PhoneValidationResult } from "@/lib/validation/phone";
import { validatePhone } from "@/lib/validation/phone";
import {
  computeAttributionQuality,
  logAttributionSummary,
  summarizeAttribution,
  type AnalyzedMessage
} from "@/lib/analysis/attribution";
import { buildNetworkProfilePayload, getDistinctSellerCountForIg, getNetworkIgStats } from "@/lib/network/network-layer";
import { getSignalWeightMap } from "@/lib/network/signal-learning";

/** Only columns that exist on `public.buyers` — PostgREST rejects unknown keys. */
function buyerPhoneDb(p: PhoneValidationResult & { phone_valid: boolean }) {
  return {
    phone_valid: p.phone_valid,
    phone_carrier: p.phone_carrier ?? null,
    phone_is_voip: p.phone_is_voip ?? null,
    phone_country: p.phone_country ?? null,
    phone_region: p.phone_region ?? null,
    phone_city: p.phone_city ?? null
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

/** Privacy: raw transcript is not persisted (Improvement Six). */
function formatChatForStorage(_messages: Array<{ role: string; text: string }>) {
  return "";
}

/** Same transcript in different DOM order → same hash → cache hit / identical analysis. */
function toAnalyzedMessages(
  messages: Array<{
    role: string;
    text: string;
    attribution_confidence?: number;
    attribution_signals?: string[];
  }>
): AnalyzedMessage[] {
  return messages.map((m) => ({
    role: m.role,
    text: m.text,
    attribution_confidence: m.attribution_confidence,
    attribution_signals: m.attribution_signals
  }));
}

function canonicalMessagesForHash(
  messages: Array<{
    role: string;
    text: string;
    attribution_confidence?: number;
  }>
) {
  return [...messages]
    .map((m) => ({
      role: String(m.role ?? "").toLowerCase().trim(),
      text: String(m.text ?? "").trim(),
      attribution_confidence: m.attribution_confidence
    }))
    .filter((m) => m.text.length > 0)
    .sort((a, b) => {
      const cmp = a.text.localeCompare(b.text);
      if (cmp !== 0) return cmp;
      return a.role.localeCompare(b.role);
    });
}

function phoneFromBuyerRow(buyer: Record<string, unknown>): PhoneResult {
  const num = buyer.phone_number != null ? String(buyer.phone_number) : "";
  const raw = (buyer.ai_raw_response as Record<string, unknown> | undefined) ?? {};
  return {
    phone_valid: typeof buyer.phone_valid === "boolean" ? buyer.phone_valid : null,
    phone_carrier: (buyer.phone_carrier as string) ?? null,
    phone_is_voip: typeof buyer.phone_is_voip === "boolean" ? buyer.phone_is_voip : null,
    phone_type: (raw.phone_type as string) ?? null,
    phone_country: (buyer.phone_country as string) ?? null,
    phone_region: (buyer.phone_region as string) ?? (raw.phone_region as string) ?? null,
    phone_city: (buyer.phone_city as string) ?? (raw.phone_city as string) ?? null,
    phone_international_format: (raw.phone_international_format as string) ?? null,
    phone_local_format: (raw.phone_local_format as string) ?? null,
    phone_lookup_query: (raw.phone_lookup_query as string) ?? null,
    phone_number: num || null,
    configured: true,
    not_provided: !num.length,
    error: null
  };
}

function addressFromBuyerRow(buyer: Record<string, unknown>): AddressResult {
  const rawAddr = buyer.address_raw != null ? String(buyer.address_raw) : "";
  const hasGeo = buyer.address_lat != null && buyer.address_lng != null;
  return {
    address_found: hasGeo,
    address_formatted: (buyer.address_formatted as string) ?? null,
    address_lat: buyer.address_lat != null ? Number(buyer.address_lat) : null,
    address_lng: buyer.address_lng != null ? Number(buyer.address_lng) : null,
    address_city: (buyer.address_city as string) ?? null,
    address_province: (buyer.address_province as string) ?? null,
    address_country: (buyer.address_country as string) ?? null,
    address_postal_code: null,
    address_quality_score: typeof buyer.address_quality_score === "number" ? buyer.address_quality_score : 0,
    address_precision: null,
    address_types: [],
    configured: true,
    not_provided: !rawAddr.trim().length,
    error: undefined
  };
}

/** Instagram fallback often sends one transcript blob; Gemini still needs a turn structure. */
function normalizeMessages(
  messages: Array<{
    role: string;
    text: string;
    attribution_confidence?: number;
    attribution_signals?: string[];
  }> | null | undefined
) {
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
        text: chunk,
        attribution_confidence: 0.55
      }));
    }
    const mid = Math.floor(text.length / 2);
    return [
      { role: messages[0]?.role || "buyer", text: text.slice(0, mid).trim(), attribution_confidence: 0.55 },
      { role: "seller", text: text.slice(mid).trim(), attribution_confidence: 0.55 }
    ];
  }
  if (messages.length === 1 && text.length > 0) {
    return [
      { role: messages[0]?.role || "buyer", text, attribution_confidence: messages[0]?.attribution_confidence },
      { role: "seller", text: "[No additional messages captured in thread]", attribution_confidence: 0.55 }
    ];
  }
  return messages;
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders });
}

export const POST = withAuth(async ({ req, user }) => {
  try {
    console.log("[RS-DEBUG] ENV CHECK:", {
      ABSTRACT_API_KEY: process.env.ABSTRACT_API_KEY
        ? `SET (${String(process.env.ABSTRACT_API_KEY).length} chars)`
        : "MISSING",
      GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY ? "SET" : "MISSING",
      NODE_ENV: process.env.NODE_ENV
    });

    const body = await req.json();
    const rawBody = body as {
      messages?: Array<{
        role: string;
        text: string;
        attribution_confidence?: number;
        attribution_signals?: string[];
      }>;
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

    const analyzedForLog = toAnalyzedMessages(messages);
    logAttributionSummary("RS-ATTRIB", analyzedForLog);
    const attribCounts = summarizeAttribution(analyzedForLog);
    const attributionQuality = computeAttributionQuality(attribCounts);

    const messageCount = messages.length;

    const conversationHash = createHash("sha256")
      .update(
        JSON.stringify({
          messages: canonicalMessagesForHash(messages),
          username,
          phone: phoneStr,
          address: addressStr
        })
      )
      .digest("hex");

    const appBase = getPublicAppUrl();
    console.log("[RS] Link base URL (dashboard / extension deep links):", appBase);

    const cachedBuyer = await findBuyerByConversationHash(user.id, conversationHash);
    if (cachedBuyer) {
      console.log("[RS] Cache hit — returning existing analysis for hash", conversationHash.slice(0, 8));
      const [historicalData, networkIgCached, distinctCached] = await Promise.all([
        getHistoricalData(phoneStr || null, username),
        getNetworkIgStats(username),
        getDistinctSellerCountForIg(username)
      ]);
      const networkProfileCached = buildNetworkProfilePayload(networkIgCached, distinctCached);
      const rawCached = (cachedBuyer.ai_raw_response as Record<string, unknown>) ?? {};
      const msgCount =
        typeof rawCached.message_count === "number" ? rawCached.message_count : messageCount;
      const riskRows = await listRiskSignalsForBuyer(String(cachedBuyer.id));
      const signals = riskRows.map((r) => ({
        signal_type: r.signal_type as "chat" | "address" | "phone" | "history",
        signal_name: String(r.signal_name),
        impact: Number(r.impact),
        description: r.description != null ? String(r.description) : ""
      }));
      const aiReasons = Array.isArray(cachedBuyer.ai_reasons)
        ? (cachedBuyer.ai_reasons as string[])
        : Array.isArray(rawCached.ai_reasons)
          ? (rawCached.ai_reasons as string[])
          : [];
      const conflictsCached = Array.isArray(rawCached.signal_conflicts_resolved)
        ? rawCached.signal_conflicts_resolved
        : Array.isArray(rawCached.conflict_resolutions)
          ? rawCached.conflict_resolutions
          : [];

      const cachedAttribQ = rawCached.attribution_quality as Record<string, unknown> | undefined;
      const attributionUnreliableCached =
        typeof rawCached.attribution_unreliable === "boolean"
          ? rawCached.attribution_unreliable
          : Boolean(cachedAttribQ?.unreliable === true);

      return Response.json(
        {
          buyer_id: cachedBuyer.id,
          trust_score: cachedBuyer.final_trust_score,
          risk_level: cachedBuyer.final_risk_level,
          analyst_notes: (rawCached.analyst_notes as string) ?? null,
          ai_reasons: aiReasons,
          positive_signals: Array.isArray(rawCached.positive_signals) ? rawCached.positive_signals : [],
          negative_signals: Array.isArray(rawCached.negative_signals) ? rawCached.negative_signals : [],
          recommendation: (rawCached.recommendation as string) ?? "caution",
          buyer_seriousness: (cachedBuyer.ai_buyer_seriousness as string) ?? null,
          commitment_confirmed: Boolean(rawCached.commitment_confirmed),
          communication_quality: (rawCached.communication_quality as string) ?? null,
          message_count: msgCount,
          conversation_summary:
            typeof rawCached.conversation_summary === "string" ? rawCached.conversation_summary : null,
          hesitation_detected: Boolean(rawCached.hesitation_detected),
          asked_about_returns: Boolean(rawCached.asked_about_returns),
          shared_phone_proactively: Boolean(rawCached.shared_phone_proactively),
          shared_address_proactively: Boolean(rawCached.shared_address_proactively),
          excessive_bargaining: Boolean(rawCached.excessive_bargaining),
          phone_analysis: phoneFromBuyerRow(cachedBuyer as Record<string, unknown>),
          address_analysis: addressFromBuyerRow(cachedBuyer as Record<string, unknown>),
          historical_data: historicalData ?? [],
          signals,
          network_profile: networkProfileCached,
          signal_conflicts_resolved: conflictsCached,
          attribution_unreliable: attributionUnreliableCached,
          attribution_quality: cachedAttribQ ?? null,
          cached: true,
          dashboard_url: `${appBase}/dashboard/buyers/${cachedBuyer.id}`,
          disclaimer:
            "Advisory only. ReturnSense does not block buyers or take automatic action—you decide whether to ship."
        },
        { headers: corsHeaders }
      );
    }

    const quota = await checkQuota(user.id, user.email);
    if (!quota.allowed) {
      return apiError("Monthly limit reached. Upgrade plan.", 429);
    }

    const [historicalData, networkIg, signalWeightMap, distinctSellerCount] = await Promise.all([
      getHistoricalData(phoneStr || null, username),
      getNetworkIgStats(username),
      getSignalWeightMap(),
      getDistinctSellerCountForIg(username)
    ]);
    const networkProfile = buildNetworkProfilePayload(networkIg, distinctSellerCount);

    const phoneNotProvided: PhoneValidationResult = {
      phone_valid: null,
      phone_carrier: null,
      phone_is_voip: null,
      phone_type: null,
      phone_country: null,
      phone_region: null,
      phone_city: null,
      phone_international_format: null,
      phone_local_format: null,
      phone_number: null,
      phone_lookup_query: null,
      configured: true,
      not_provided: true,
      error: null
    };

    const addressNotProvided: AddressResult = {
      address_found: false,
      address_formatted: null,
      address_lat: null,
      address_lng: null,
      address_city: null,
      address_province: null,
      address_country: null,
      address_postal_code: null,
      address_quality_score: 0,
      address_precision: null,
      address_types: [],
      configured: true,
      not_provided: true
    };

    const [phoneResult, addressResult] = await Promise.all([
      phoneStr ? validatePhone(phoneStr) : Promise.resolve(phoneNotProvided),
      addressStr ? validateAddress(addressStr) : Promise.resolve(addressNotProvided)
    ]);

    console.log("[RS-PHONE] validation summary:", {
      configured: phoneResult.configured,
      not_provided: phoneResult.not_provided,
      phone_valid: phoneResult.phone_valid,
      error: phoneResult.error ?? null
    });

    const aiResult = await analyzeWithGemini(
      messages,
      username,
      phoneStr || null,
      addressStr || null,
      networkIg,
      distinctSellerCount,
      attributionQuality.note_for_prompt || null
    );

    const { finalScore, riskLevel, signals } = computeFinalScore({
      aiResult,
      phoneResult,
      addressResult,
      historicalData,
      chatMessages: messages,
      buyerScoringCount: attribCounts.buyer_for_scoring,
      networkIgRow: networkIg,
      signalWeightMap,
      attributionUnreliable: attributionQuality.unreliable
    });

    const triRaw = (aiResult.ai_raw_response ?? {}) as Record<string, unknown>;
    const conflicts = Array.isArray(triRaw.conflict_resolutions) ? triRaw.conflict_resolutions : [];

    const phoneDigest =
      phoneResult.configured && phoneResult.not_provided !== true
        ? `valid=${String(phoneResult.phone_valid)}, voip=${String(phoneResult.phone_is_voip)}, country=${String(phoneResult.phone_country ?? "")}, carrier=${String(phoneResult.phone_carrier ?? "")}`
        : "phone not validated or not provided";

    const addressDigest =
      addressResult?.configured === true && addressResult.not_provided !== true
        ? `found=${String(addressResult.address_found)}, quality=${String(addressResult.address_quality_score ?? "")}, precision=${String(addressResult.address_precision ?? "")}`
        : "address not geocoded or not provided";

    const signalsDigest = signals
      .map((s) => `${s.signal_type}:${s.signal_name} (${s.impact}) — ${s.description}`)
      .join("\n");

    const synth = await synthesizeAnalystNarrative({
      triRaw,
      networkProfile,
      phoneDigest,
      addressDigest,
      finalScore,
      riskLevel,
      signalsDigest,
      triRecommendationPrior: aiResult.recommendation
    });

    const analystNotesFinal =
      synth?.analyst_notes?.trim() ||
      (triRaw.tri_engine === true
        ? "Tri-model analysis complete — see structured signals and scoring breakdown."
        : aiResult.analyst_notes);
    const recommendationFinal = synth?.recommendation || aiResult.recommendation;

    const aiForSave: AiStructuredResult = {
      ...aiResult,
      analyst_notes: analystNotesFinal,
      recommendation: recommendationFinal,
      ai_raw_response: {
        ...triRaw,
        analyst_notes: analystNotesFinal,
        recommendation: recommendationFinal,
        synthesis: synth?.raw ?? null,
        signal_conflicts_resolved: conflicts,
        network_profile: networkProfile
      }
    };

    const phoneDbPayload =
      phoneResult?.configured === true && typeof phoneResult.phone_valid === "boolean"
        ? buyerPhoneDb(phoneResult as PhoneResult & { phone_valid: boolean })
        : {};

    const addressDbPayload =
      addressResult?.configured === true && addressResult.not_provided !== true
        ? buyerAddressDb(addressResult)
        : {};

    const aiPayload = buyerRowPayloadFromAi(aiForSave);
    const mergedRaw = {
      ...(aiPayload.ai_raw_response as Record<string, unknown>),
      message_count: messageCount,
      attribution_summary: {
        total_messages: attribCounts.total,
        buyer_high_confidence: attribCounts.buyer_high,
        seller_high_confidence: attribCounts.seller_high,
        buyer_medium_background: attribCounts.buyer_medium,
        seller_medium_background: attribCounts.seller_medium,
        unattributed_or_low_confidence: attribCounts.unattributed_low,
        buyer_for_scoring: attribCounts.buyer_for_scoring,
        seller_labeled: attribCounts.seller_labeled,
        uncertain: attribCounts.uncertain
      },
      attribution_quality: attributionQuality,
      attribution_unreliable: attributionQuality.unreliable,
      network_profile: networkProfile,
      ...(phoneResult.configured && phoneResult.not_provided !== true
        ? {
            phone_lookup_query: phoneResult.phone_lookup_query,
            phone_region: phoneResult.phone_region,
            phone_city: phoneResult.phone_city,
            phone_international_format: phoneResult.phone_international_format,
            phone_local_format: phoneResult.phone_local_format,
            phone_type: phoneResult.phone_type
          }
        : {})
    };

    const buyer = await saveBuyer({
      seller_id: user.id,
      instagram_username: username,
      phone_number: phoneStr || null,
      address_raw: addressStr || null,
      ...phoneDbPayload,
      ...addressDbPayload,
      ...aiPayload,
      ai_raw_response: mergedRaw,
      final_trust_score: finalScore,
      final_risk_level: riskLevel,
      chat_snapshot: formatChatForStorage(messages),
      conversation_hash: conversationHash
    });

    await saveSignals(buyer.id, signals);
    await incrementUsage(user.id, user.email);

    const raw = aiForSave.ai_raw_response as Record<string, unknown> | undefined;

    return Response.json(
      {
        buyer_id: buyer.id,
        trust_score: finalScore,
        risk_level: riskLevel,
        analyst_notes: (raw?.analyst_notes as string | undefined) ?? analystNotesFinal ?? null,
        ai_reasons: aiForSave.ai_reasons ?? [],
        positive_signals: aiForSave.positive_signals ?? [],
        negative_signals: aiForSave.negative_signals ?? [],
        recommendation: recommendationFinal ?? "caution",
        buyer_seriousness: aiForSave.ai_buyer_seriousness ?? null,
        commitment_confirmed: Boolean(raw?.commitment_confirmed),
        communication_quality: (raw?.communication_quality as string | null | undefined) ?? null,
        message_count: messageCount,
        conversation_summary:
          typeof raw?.conversation_summary === "string" ? raw.conversation_summary : null,
        hesitation_detected: Boolean(raw?.hesitation_detected),
        asked_about_returns: Boolean(raw?.asked_about_returns),
        shared_phone_proactively: Boolean(raw?.shared_phone_proactively),
        shared_address_proactively: Boolean(raw?.shared_address_proactively),
        excessive_bargaining: Boolean(raw?.excessive_bargaining),
        phone_analysis: phoneResult,
        address_analysis: addressResult,
        historical_data: historicalData ?? [],
        signals,
        network_profile: networkProfile,
        signal_conflicts_resolved: conflicts,
        attribution_unreliable: attributionQuality.unreliable,
        attribution_quality: attributionQuality,
        cached: false,
        dashboard_url: `${appBase}/dashboard/buyers/${buyer.id}`,
        disclaimer:
          "Advisory only. ReturnSense does not block buyers or take automatic action—you decide whether to ship."
      },
      { headers: corsHeaders }
    );
  } catch (err) {
    logServerError("POST /api/analyze", err);
    const message = err instanceof Error ? err.message : "Analysis failed";
    return apiError(message, 500);
  }
});
