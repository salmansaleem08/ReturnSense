import type { AiStructuredResult } from "@/lib/ai/openrouter";

const SYSTEM = `ReturnSense tri-model: output was already parsed. Deterministic merge only.`;

type BehaviorOut = {
  hesitation_markers?: boolean;
  engagement_quality?: string;
  roman_urdu_or_mixed_register?: boolean;
  buyer_questions_product_specific?: boolean;
  notes?: string;
};

type CommitmentOut = {
  explicit_order_confirmation?: boolean;
  confirmation_appears_genuine?: boolean;
  confirmation_appears_hesitant_or_perfunctory?: boolean;
  notes?: string;
};

type FraudOut = {
  confirmed_without_contact?: boolean;
  returns_before_order?: boolean;
  city_only_or_vague_address?: boolean;
  excessive_bargaining_then_confirm?: boolean;
  proactive_phone_in_chat?: boolean;
  proactive_address_in_chat?: boolean;
  notes?: string;
};

/**
 * Single source of truth for final numeric score. Same inputs -> same output.
 * Models never output trust_score; only structured booleans/labels consumed here.
 */
export function aggregateTriSignals(
  behavior: Record<string, unknown> | null,
  commitment: Record<string, unknown> | null,
  fraud: Record<string, unknown> | null,
  modelMeta: { behavior_ok: boolean; commitment_ok: boolean; fraud_ok: boolean }
): AiStructuredResult {
  const b = behavior as BehaviorOut | null;
  const c = commitment as CommitmentOut | null;
  const f = fraud as FraudOut | null;
  let score = 50;
  const positive: string[] = [];
  const negative: string[] = [];
  const reasons: string[] = [];

  if (b?.hesitation_markers) {
    score -= 10;
    negative.push("Hesitation markers in buyer speech (Model A)");
    reasons.push("hesitation_markers (A)");
  }
  const eq = String(b?.engagement_quality ?? "medium").toLowerCase();
  if (eq === "high") {
    score += 6;
    positive.push("Strong engagement quality (Model A)");
  } else if (eq === "low") {
    score -= 6;
    negative.push("Low engagement quality (Model A)");
  }
  if (b?.buyer_questions_product_specific) {
    score += 5;
    positive.push("Product-specific questions (Model A)");
  }
  if (b?.notes) reasons.push(`A: ${b.notes}`);

  if (c?.explicit_order_confirmation && c?.confirmation_appears_genuine) {
    score += 12;
    positive.push("Explicit genuine-seeming confirmation (Model B)");
  }
  if (c?.confirmation_appears_hesitant_or_perfunctory) {
    score -= 12;
    negative.push("Hesitant or perfunctory confirmation (Model B)");
  }
  if (c?.notes) reasons.push(`B: ${c.notes}`);

  if (f?.proactive_phone_in_chat) {
    score += 8;
    positive.push("Proactive phone share in chat (Model C)");
  }
  if (f?.proactive_address_in_chat) {
    score += 8;
    positive.push("Proactive address share in chat (Model C)");
  }
  if (f?.returns_before_order) {
    score -= 22;
    negative.push("Return policy asked before order (Model C — COD risk)");
  }
  if (f?.city_only_or_vague_address) {
    score -= 12;
    negative.push("Vague / city-only address pattern (Model C)");
  }
  if (f?.excessive_bargaining_then_confirm) {
    score -= 14;
    negative.push("Heavy bargaining then confirm (Model C)");
  }
  if (f?.confirmed_without_contact) {
    score -= 16;
    negative.push("Confirm without contact details in conversation (Model C)");
  }
  if (f?.notes) reasons.push(`C: ${f.notes}`);

  if (!modelMeta.behavior_ok) {
    score -= 2;
    reasons.push("behavior model unavailable — slight penalty");
  }
  if (!modelMeta.commitment_ok) {
    score -= 2;
    reasons.push("commitment model unavailable — slight penalty");
  }
  if (!modelMeta.fraud_ok) {
    score -= 2;
    reasons.push("fraud model unavailable — slight penalty");
  }

  const trust_score = Math.round(Math.max(5, Math.min(97, score)));

  const engagement_to_quality = (): string => {
    if (eq === "high") return "good";
    if (eq === "low") return "poor";
    return "average";
  };

  let risk_level: string;
  if (trust_score >= 75) risk_level = "low";
  else if (trust_score >= 55) risk_level = "medium";
  else if (trust_score >= 35) risk_level = "high";
  else risk_level = "critical";

  let recommendation: string;
  if (trust_score >= 70) recommendation = "proceed";
  else if (trust_score >= 50) recommendation = "caution";
  else if (trust_score >= 30) recommendation = "hold";
  else recommendation = "reject";

  const ai_raw: Record<string, unknown> = {
    tri_engine: true,
    model_meta: modelMeta,
    behavior,
    commitment,
    fraud,
    trust_score,
    risk_level,
    positive_signals: positive,
    negative_signals: negative,
    commitment_confirmed: Boolean(c?.explicit_order_confirmation && c?.confirmation_appears_genuine),
    hesitation_detected: Boolean(b?.hesitation_markers || c?.confirmation_appears_hesitant_or_perfunctory),
    asked_about_returns: Boolean(f?.returns_before_order),
    shared_phone_proactively: Boolean(f?.proactive_phone_in_chat),
    shared_address_proactively: Boolean(f?.proactive_address_in_chat),
    excessive_bargaining: Boolean(f?.excessive_bargaining_then_confirm),
    communication_quality: engagement_to_quality(),
    conversation_summary: [b?.notes, f?.notes].filter(Boolean).join(" ") || "Tri-model analysis"
  };

  return {
    ai_trust_score: trust_score,
    ai_risk_level: risk_level,
    ai_hesitation_detected: Boolean(b?.hesitation_markers || c?.confirmation_appears_hesitant_or_perfunctory),
    ai_buyer_seriousness: eq === "high" ? "high" : eq === "low" ? "low" : "medium",
    ai_reasons: reasons.length ? reasons : ["Tri-model deterministic merge"],
    positive_signals: positive,
    negative_signals: negative,
    recommendation,
    analyst_notes: [b?.notes, c?.notes, f?.notes].filter(Boolean).join(" ") || SYSTEM,
    ai_raw_response: ai_raw
  };
}
