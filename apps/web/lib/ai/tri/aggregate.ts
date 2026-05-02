import type { AiStructuredResult } from "@/lib/ai/openrouter";

import { resolveTriConflicts } from "@/lib/ai/tri/conflict-resolution";

/**
 * Deterministic merge for tri-model JSON outputs.
 * Models do not emit final trust_score; this function does.
 *
 * Conflict resolutions (seller-safe) are applied before numeric composition — see
 * `conflict-resolution.ts` for documented rules (CR-1 … CR-3).
 */
export function aggregateTriSignals(
  behavior: Record<string, unknown> | null,
  commitment: Record<string, unknown> | null,
  fraud: Record<string, unknown> | null,
  modelMeta: { behavior_ok: boolean; commitment_ok: boolean; fraud_ok: boolean }
): AiStructuredResult {
  const b = behavior;
  const c = commitment;
  const f = fraud;

  const conflict = resolveTriConflicts({ behavior: b, commitment: c, fraud: f });

  let score = 50;
  const positive: string[] = [];
  const negative: string[] = [];
  const reasons: string[] = [];

  for (const e of conflict.entries) {
    reasons.push(`${e.rule_id}: ${e.resolution}`);
  }

  if (b?.hesitation_markers) {
    score -= 10;
    negative.push("Hesitation markers in buyer speech (Model A)");
    reasons.push("hesitation_markers (A)");
  }
  let eq = String(b?.engagement_quality ?? "medium").toLowerCase();
  if (eq === "high") {
    const bump = Math.round(6 * conflict.engagement_bonus_factor);
    if (bump > 0) {
      score += bump;
      positive.push("Strong engagement quality (Model A)");
    } else {
      reasons.push("engagement bonus dampened (conflict resolution)");
    }
  } else if (eq === "low") {
    score -= 6;
    negative.push("Low engagement quality (Model A)");
  }
  if (b?.buyer_questions_product_specific) {
    score += 5;
    positive.push("Product-specific questions (Model A)");
  }
  if (typeof b?.sequence_risk_note === "string" && String(b.sequence_risk_note).length > 2) {
    reasons.push(`sequence (A): ${b.sequence_risk_note}`);
  }
  if (typeof b?.network_history_weight_note === "string") {
    reasons.push(`network weight (A): ${b.network_history_weight_note}`);
  }

  const withdrew = c?.buyer_withdrew_cancelled_or_refused_order === true;
  const noReceive = c?.buyer_cannot_receive_delivery_stated === true;

  if (withdrew) {
    score -= 40;
    negative.push("Buyer withdrew, cancelled, or refused the order in the thread (Model B)");
    reasons.push("order_withdrawn (B)");
  }
  if (noReceive) {
    score -= 36;
    negative.push("Buyer stated they cannot receive delivery (Model B)");
    reasons.push("cannot_receive (B)");
  }

  const hardStop = withdrew || noReceive;

  const depth = String(c?.commitment_depth_overall ?? "moderate").toLowerCase();
  const depthBonusRaw =
    depth === "deep" ? 16 : depth === "moderate" ? 10 : depth === "shallow" ? 3 : 0;
  const depthBonus = Math.round(depthBonusRaw * conflict.commitment_depth_factor);

  if (!hardStop && c?.explicit_order_confirmation && c?.confirmation_appears_genuine && depthBonus > 0) {
    score += depthBonus;
    positive.push(`Commitment depth: ${depth} (Model B)`);
  } else if (!hardStop && c?.explicit_order_confirmation && c?.confirmation_appears_genuine) {
    score += Math.round(12 * conflict.commitment_depth_factor);
    positive.push("Explicit genuine-seeming confirmation (Model B)");
  }
  if (c?.confirmation_appears_hesitant_or_perfunctory && !hardStop) {
    score -= 12;
    negative.push("Hesitant or perfunctory confirmation (Model B)");
  }
  if (typeof c?.network_history_weight_note === "string") {
    reasons.push(`network weight (B): ${c.network_history_weight_note}`);
  }

  const ghost = Math.max(0, Math.min(3, Number(f?.confirmation_ghost_strength ?? 0) || 0));
  const retEx = Math.max(0, Math.min(3, Number(f?.return_extractor_strength ?? 0) || 0));
  const addrT = Math.max(0, Math.min(3, Number(f?.address_tester_strength ?? 0) || 0));
  const priceA = Math.max(0, Math.min(3, Number(f?.price_anchor_drop_strength ?? 0) || 0));
  const combo = Math.max(0, Math.min(100, Number(f?.pattern_combination_risk ?? 0) || 0));

  const ghostEff = Math.max(ghost, f?.confirmed_without_contact === true ? 2 : 0);
  const retEff = Math.max(retEx, f?.returns_before_order === true ? 2 : 0);
  const addrEff = Math.max(addrT, f?.city_only_or_vague_address === true ? 2 : 0);
  const priceEff = Math.max(priceA, f?.excessive_bargaining_then_confirm === true ? 2 : 0);

  const comboPenalty = Math.round(combo * 0.22);

  if (retEff > 0) {
    score -= 10 + retEff * 8;
    negative.push(`Return-extractor pattern strength ${retEff} (Model C)`);
  }
  if (addrEff > 0) {
    score -= 8 + addrEff * 6;
    negative.push(`Address-tester / vague address strength ${addrEff} (Model C)`);
  }
  if (priceEff > 0) {
    score -= 10 + priceEff * 7;
    negative.push(`Price-anchor / heavy haggle strength ${priceEff} (Model C)`);
  }
  if (ghostEff > 0) {
    score -= 12 + ghostEff * 7;
    negative.push(`Confirmation-ghost / no contact strength ${ghostEff} (Model C)`);
  }

  score -= comboPenalty;
  if (combo >= 35) {
    negative.push(`Combined fraud pattern risk ${combo}/100 (Model C)`);
    reasons.push(`pattern combo: ${f?.pattern_combination_note ?? "multiple patterns"}`);
  }

  score -= conflict.extra_fraud_penalty;
  if (conflict.extra_fraud_penalty > 0) {
    reasons.push(`conflict resolution extra caution: -${conflict.extra_fraud_penalty}`);
  }

  const fraudCannot = f?.cannot_fulfill_delivery_buyer_side === true;
  if (fraudCannot) {
    score -= 28;
    negative.push("Buyer-side delivery fulfillment blocked (Model C)");
    reasons.push("cannot_fulfill (C)");
  }
  if (typeof f?.network_history_weight_note === "string") {
    reasons.push(`network weight (C): ${f.network_history_weight_note}`);
  }

  const anyHardStop = hardStop || fraudCannot;

  if (!anyHardStop && f?.proactive_phone_in_chat) {
    score += 8;
    positive.push("Proactive phone share in chat (Model C)");
  }
  if (!anyHardStop && f?.proactive_address_in_chat) {
    score += 8;
    positive.push("Proactive address share in chat (Model C)");
  }

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

  let trust_score = Math.round(Math.max(5, Math.min(97, score)));
  if (anyHardStop) {
    trust_score = Math.min(trust_score, 44);
  }

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
    conflict_resolutions: conflict.entries,
    conflict_resolution_meta: {
      engagement_bonus_factor: conflict.engagement_bonus_factor,
      extra_fraud_penalty: conflict.extra_fraud_penalty,
      commitment_depth_factor: conflict.commitment_depth_factor
    },
    trust_score,
    risk_level,
    positive_signals: positive,
    negative_signals: negative,
    buyer_withdrew_cancelled_or_refused_order: withdrew,
    buyer_cannot_receive_delivery_stated: noReceive,
    cannot_fulfill_delivery_buyer_side: fraudCannot,
    commitment_confirmed: Boolean(
      !anyHardStop && c?.explicit_order_confirmation && c?.confirmation_appears_genuine
    ),
    commitment_depth_overall: depth,
    hesitation_detected: Boolean(b?.hesitation_markers || c?.confirmation_appears_hesitant_or_perfunctory),
    asked_about_returns: Boolean(f?.returns_before_order),
    shared_phone_proactively: Boolean(f?.proactive_phone_in_chat),
    shared_address_proactively: Boolean(f?.proactive_address_in_chat),
    excessive_bargaining: Boolean(f?.excessive_bargaining_then_confirm),
    communication_quality: engagement_to_quality(),
    conversation_summary: [b?.notes, f?.notes].filter(Boolean).join(" ").trim() || "Tri-model analysis",
    analyst_notes_pending_synthesis: true
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
    analyst_notes: "",
    ai_raw_response: ai_raw
  };
}
