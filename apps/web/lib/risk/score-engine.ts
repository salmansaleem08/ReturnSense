import type { NetworkIgRow } from "@/lib/network/network-layer";
import type { AddressResult } from "@/lib/validation/address";
import { getAddressRiskScore } from "@/lib/validation/address";
import type { PhoneResult } from "@/lib/validation/phone";
import { getPhoneRiskScore } from "@/lib/validation/phone";

interface ScoreInput {
  aiResult: {
    ai_trust_score?: number;
    negative_signals?: string[];
    positive_signals?: string[];
    ai_raw_response?: Record<string, unknown>;
  } | null;
  phoneResult: unknown;
  addressResult: unknown;
  historicalData: Array<{ outcome: string; outcome_marked_at?: string | null }>;
  chatMessages?: Array<{ role: string; text: string }>;
  /** High-confidence buyer lines only — excludes uncertain/seller from behavioral sampling thresholds. */
  buyerScoringCount?: number;
  /** Full network row for structural ceiling + ratios. */
  networkIgRow?: NetworkIgRow | null;
  /** Per-signal multiplier after MIN observations (learning layer); absent keys default to 1. */
  signalWeightMap?: Record<string, number>;
  /** Server flagged unreliable message direction — discount final score (uncertainty, not fraud). */
  attributionUnreliable?: boolean;
}

interface Signal {
  signal_type: "chat" | "address" | "phone" | "history";
  signal_name: string;
  impact: number;
  description: string;
}

function getPhoneRiskScoreOrNeutral(phoneResult: unknown) {
  const p = phoneResult as PhoneResult | null | undefined;
  if (p == null || p.configured === false) {
    return {
      score: 50,
      signals: [
        {
          name: "phone_validation_unavailable",
          impact: 0,
          description: "Phone validation service not configured — score is neutral"
        }
      ]
    };
  }
  return getPhoneRiskScore(p);
}

function getAddressRiskScoreOrNeutral(addressResult: unknown) {
  const a = addressResult as AddressResult | null | undefined;
  if (a == null || a.configured === false) {
    return {
      score: 50,
      signals: [
        {
          name: "address_validation_unavailable",
          impact: 0,
          description: "Address geocoding service not configured — score is neutral"
        }
      ]
    };
  }
  return getAddressRiskScore(a);
}

function wmap(name: string, m?: Record<string, number>): number {
  const v = m?.[name];
  return typeof v === "number" && v > 0 ? v : 1;
}

function isPakistanNumber(phoneResult: unknown): boolean {
  const p = phoneResult as PhoneResult | null | undefined;
  if (!p?.phone_country) return false;
  const c = String(p.phone_country).toLowerCase();
  return c.includes("pakistan") || c === "pk";
}

function phoneIsStrongIdentifier(phoneResult: unknown): boolean {
  const p = phoneResult as PhoneResult | null | undefined;
  if (!p || p.configured !== true || p.not_provided === true) return false;
  return p.phone_valid === true && p.phone_is_voip !== true;
}

/**
 * Hard ceiling from verified cross-seller fake outcomes — overrides rosy chat (Improvement Five).
 * Documented caps: multiple fakes cap very low; single fake with bad ratio caps mid-low.
 */
export function computeNetworkScoreCeiling(row: NetworkIgRow | null | undefined): number | null {
  if (!row) return null;
  const f = Number(row.fake_count) || 0;
  const t = Number(row.total_marked) || 0;
  if (f <= 0) return null;
  if (f >= 3) return 8;
  if (f >= 2) return 12;
  if (t >= 3 && f / t >= 0.25) return 18;
  if (f === 1) return 34;
  return null;
}

export function computeFinalScore({
  aiResult,
  phoneResult,
  addressResult,
  historicalData,
  chatMessages,
  buyerScoringCount,
  networkIgRow,
  signalWeightMap,
  attributionUnreliable
}: ScoreInput) {
  const signals: Signal[] = [];
  const wm = signalWeightMap;

  const histN = historicalData?.length ?? 0;
  let aiW = 0.45;
  let phoneW = 0.15;
  let addrW = 0.2;
  let histW = 0.2;

  if (histN >= 3) {
    aiW = 0.33;
    histW = 0.34;
    phoneW = 0.165;
    addrW = 0.195;
  }

  if (isPakistanNumber(phoneResult)) {
    phoneW += 0.05;
    aiW -= 0.05;
  }

  if (!phoneIsStrongIdentifier(phoneResult)) {
    addrW += 0.06;
    aiW -= 0.06;
  } else {
    const a = addressResult as AddressResult | null | undefined;
    if (a?.configured === true && a.not_provided !== true && a.address_found === true) {
      const addrBefore = addrW;
      addrW *= 0.88;
      aiW += addrBefore * 0.12;
    }
  }

  const wSum = aiW + phoneW + addrW + histW;
  aiW /= wSum;
  phoneW /= wSum;
  addrW /= wSum;
  histW /= wSum;

  const aiScore = aiResult?.ai_trust_score ?? 50;
  let weightedScore = aiScore * aiW;
  (aiResult?.negative_signals || []).forEach((s) => {
    const base = -8;
    const impact = Math.round(base * wmap(s, wm));
    signals.push({ signal_type: "chat", signal_name: s, impact, description: s });
  });
  (aiResult?.positive_signals || []).forEach((s) => {
    const base = 8;
    const impact = Math.round(base * wmap(s, wm));
    signals.push({ signal_type: "chat", signal_name: s, impact, description: s });
  });

  const rawAi = (aiResult?.ai_raw_response ?? null) as Record<string, unknown> | null;
  if (rawAi?.shared_phone_proactively === true) {
    const name = "proactive_phone_share";
    signals.push({
      signal_type: "chat",
      signal_name: name,
      impact: Math.round(8 * wmap(name, wm)),
      description: "Buyer shared phone number without being asked"
    });
  }
  if (rawAi?.shared_address_proactively === true) {
    const name = "proactive_address_share";
    signals.push({
      signal_type: "chat",
      signal_name: name,
      impact: Math.round(8 * wmap(name, wm)),
      description: "Buyer shared delivery address proactively"
    });
  }
  if (rawAi?.excessive_bargaining === true) {
    const name = "excessive_bargaining";
    signals.push({
      signal_type: "chat",
      signal_name: name,
      impact: Math.round(-12 * wmap(name, wm)),
      description: "Excessive price negotiation followed by sudden confirmation — common fake order pattern"
    });
  }
  if (rawAi?.asked_about_returns === true) {
    const name = "asked_about_returns";
    signals.push({
      signal_type: "chat",
      signal_name: name,
      impact: Math.round(-15 * wmap(name, wm)),
      description: "Buyer asked about return policy before confirming — significant risk indicator for COD"
    });
  }

  const messageCount = chatMessages?.length ?? 0;
  const behavioralCount =
    typeof buyerScoringCount === "number" ? buyerScoringCount : messageCount;
  if (behavioralCount < 3) {
    const name = "insufficient_buyer_attribution";
    signals.push({
      signal_type: "chat",
      signal_name: name,
      impact: Math.round(-10 * wmap(name, wm)),
      description: `Only ${behavioralCount} high-confidence buyer message(s) for scoring — insufficient attributed buyer speech`
    });
  } else if (messageCount >= 10) {
    const name = "rich_conversation_data";
    signals.push({
      signal_type: "chat",
      signal_name: name,
      impact: Math.round(5 * wmap(name, wm)),
      description: "Extended conversation provides good signal quality"
    });
  }

  const { score: phoneRisk, signals: phoneSigs } = getPhoneRiskScoreOrNeutral(phoneResult);
  const phoneScore = Math.max(0, 100 - phoneRisk);
  weightedScore += phoneScore * phoneW;
  signals.push(
    ...phoneSigs.map((s) => ({
      signal_type: "phone" as const,
      signal_name: s.name,
      impact: s.impact,
      description: s.description
    }))
  );

  const { score: addrRisk, signals: addrSigs } = getAddressRiskScoreOrNeutral(addressResult);
  const addrScore = Math.max(0, 100 - addrRisk);
  weightedScore += addrScore * addrW;
  signals.push(
    ...addrSigs.map((s) => ({
      signal_type: "address" as const,
      signal_name: s.name,
      impact: s.impact,
      description: s.description
    }))
  );

  const { score: histScore, signals: histSigs } = getHistoricalScore(historicalData);
  weightedScore += histScore * histW;
  signals.push(
    ...histSigs.map((s) => ({
      signal_type: "history" as const,
      signal_name: s.signal_name,
      impact: s.impact,
      description: s.description
    }))
  );

  let finalScore = Math.round(Math.max(0, Math.min(100, weightedScore)));

  if (attributionUnreliable === true) {
    const beforeAttrib = finalScore;
    finalScore = Math.round(Math.max(0, Math.min(100, finalScore * 0.87)));
    signals.push({
      signal_type: "chat",
      signal_name: "attribution_direction_uncertain",
      impact: finalScore - beforeAttrib,
      description:
        "Buyer vs seller labels were unreliable for this chat — trust score is discounted to reflect uncertainty (not because the buyer looked worse)."
    });
  }

  const row = networkIgRow ?? null;
  const ceiling = computeNetworkScoreCeiling(row);

  if (ceiling != null && finalScore > ceiling) {
    finalScore = ceiling;
    signals.push({
      signal_type: "history",
      signal_name: "network_verified_ceiling",
      impact: 0,
      description:
        "Cross-seller network shows verified fake outcomes — final score capped (structured override; seller-safe precedence over chat-only positives)."
    });
  }

  return {
    finalScore,
    riskLevel: getRiskLevel(finalScore),
    signals
  };
}

export function getHistoricalScore(records: Array<{ outcome: string }>) {
  if (!records.length) return { score: 50, signals: [] as Array<{ signal_name: string; impact: number; description: string }> };
  const signals: Array<{ signal_name: string; impact: number; description: string }> = [];

  const delivered = records.filter((r) => r.outcome === "delivered").length;
  const returned = records.filter((r) => r.outcome === "returned").length;
  const fake = records.filter((r) => r.outcome === "fake").length;
  const total = records.length;

  if (fake > 0) {
    signals.push({ signal_name: "known_scammer", impact: -50, description: `Marked as fake by ${fake} seller(s)` });
    return { score: 0, signals };
  }
  if (returned > 0 && returned / total > 0.5) {
    signals.push({
      signal_name: "high_return_rate",
      impact: -35,
      description: `High return rate: ${returned}/${total} orders returned`
    });
    return { score: 20, signals };
  }
  if (delivered > 0) {
    signals.push({ signal_name: "positive_history", impact: 30, description: `${delivered} successful deliveries recorded` });
    return { score: 80, signals };
  }
  return { score: 50, signals: [] };
}

export function getRiskLevel(score: number) {
  if (score >= 75) return "low";
  if (score >= 55) return "medium";
  if (score >= 35) return "high";
  return "critical";
}
