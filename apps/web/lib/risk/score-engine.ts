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

export function computeFinalScore({
  aiResult,
  phoneResult,
  addressResult,
  historicalData,
  chatMessages
}: ScoreInput) {
  const signals: Signal[] = [];
  let weightedScore = 0;

  const aiScore = aiResult?.ai_trust_score ?? 50;
  weightedScore += aiScore * 0.45;
  (aiResult?.negative_signals || []).forEach((s) =>
    signals.push({ signal_type: "chat", signal_name: s, impact: -8, description: s })
  );
  (aiResult?.positive_signals || []).forEach((s) =>
    signals.push({ signal_type: "chat", signal_name: s, impact: 8, description: s })
  );

  const rawAi = (aiResult?.ai_raw_response ?? null) as Record<string, unknown> | null;
  if (rawAi?.shared_phone_proactively === true) {
    signals.push({
      signal_type: "chat",
      signal_name: "proactive_phone_share",
      impact: 8,
      description: "Buyer shared phone number without being asked"
    });
  }
  if (rawAi?.shared_address_proactively === true) {
    signals.push({
      signal_type: "chat",
      signal_name: "proactive_address_share",
      impact: 8,
      description: "Buyer shared delivery address proactively"
    });
  }
  if (rawAi?.excessive_bargaining === true) {
    signals.push({
      signal_type: "chat",
      signal_name: "excessive_bargaining",
      impact: -12,
      description: "Excessive price negotiation followed by sudden confirmation — common fake order pattern"
    });
  }
  if (rawAi?.asked_about_returns === true) {
    signals.push({
      signal_type: "chat",
      signal_name: "asked_about_returns",
      impact: -15,
      description: "Buyer asked about return policy before confirming — significant risk indicator for COD"
    });
  }

  const messageCount = chatMessages?.length ?? 0;
  if (messageCount < 3) {
    signals.push({
      signal_type: "chat",
      signal_name: "insufficient_chat_data",
      impact: -10,
      description: `Only ${messageCount} message(s) captured — insufficient data for reliable analysis`
    });
  } else if (messageCount >= 10) {
    signals.push({
      signal_type: "chat",
      signal_name: "rich_conversation_data",
      impact: 5,
      description: "Extended conversation provides good signal quality"
    });
  }

  const { score: phoneRisk, signals: phoneSigs } = getPhoneRiskScoreOrNeutral(phoneResult);
  const phoneScore = Math.max(0, 100 - phoneRisk);
  weightedScore += phoneScore * 0.15;
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
  weightedScore += addrScore * 0.2;
  signals.push(
    ...addrSigs.map((s) => ({
      signal_type: "address" as const,
      signal_name: s.name,
      impact: s.impact,
      description: s.description
    }))
  );

  const { score: histScore, signals: histSigs } = getHistoricalScore(historicalData);
  weightedScore += histScore * 0.2;
  signals.push(
    ...histSigs.map((s) => ({
      signal_type: "history" as const,
      signal_name: s.signal_name,
      impact: s.impact,
      description: s.description
    }))
  );

  const finalScore = Math.round(Math.max(0, Math.min(100, weightedScore)));

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
