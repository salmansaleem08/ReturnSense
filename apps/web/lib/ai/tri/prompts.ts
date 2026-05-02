import {
  formatBuyerConfirmedTranscript,
  formatSellerConfirmedTranscript,
  formatUncertainContextTranscript,
  type AnalyzedMessage
} from "@/lib/analysis/attribution";
import type { ChatMessage } from "@/lib/ai/openrouter";
import {
  buildNetworkProfilePayload,
  formatNetworkProfileForPrompt,
  type NetworkIgRow,
  type NetworkProfilePayload
} from "@/lib/network/network-layer";

function toAnalyzed(messages: ChatMessage[]): AnalyzedMessage[] {
  return messages.map((m) => ({
    role: m.role,
    text: m.text,
    attribution_confidence: m.attribution_confidence,
    attribution_signals: m.attribution_signals
  }));
}

export type TriSharedContext = {
  buyerConfirmed: string;
  sellerConfirmed: string;
  uncertainBackground: string;
  networkBlock: string;
  networkPayload: NetworkProfilePayload;
  username: string;
  phone: string;
  address: string;
  messageCount: string;
  /** Shown at top of every tri prompt when server detected unreliable direction labels. */
  attributionNote: string;
};

export function buildTriSharedContext(
  messages: ChatMessage[],
  username: string,
  phone: string,
  address: string,
  networkRow: NetworkIgRow | null,
  distinctSellerCount: number | null,
  attributionNote = ""
): TriSharedContext {
  const a = toAnalyzed(messages);
  const networkPayload = buildNetworkProfilePayload(networkRow, distinctSellerCount);
  return {
    buyerConfirmed: formatBuyerConfirmedTranscript(a) || "(none — no high-confidence buyer lines)",
    sellerConfirmed: formatSellerConfirmedTranscript(a) || "(none — no high-confidence seller lines)",
    uncertainBackground:
      formatUncertainContextTranscript(a) ||
      "(none — no uncertain or unattributed lines met inclusion rules)",
    networkBlock: formatNetworkProfileForPrompt(networkPayload),
    networkPayload,
    username,
    phone,
    address,
    messageCount: String(messages.length),
    attributionNote: attributionNote.trim()
  };
}

function transcriptHeader(ctx: TriSharedContext): string {
  const warn =
    ctx.attributionNote.length > 0
      ? `\n=== ATTRIBUTION / DIRECTION UNRELIABLE ===\n${ctx.attributionNote}\n`
      : "";
  const mergeThread =
    ctx.attributionNote.length > 0
      ? `\n=== READ AS ONE CONVERSATION (IGNORE ROLE SECTIONS FOR SPEAKER IDENTITY) ===\nAll labeled sections below may mis-attribute speakers. Merge them into a single chronological thread mentally. Focus on what was said, not who the labels claim said it.\n`
      : "";
  return `${warn}${mergeThread}${ctx.networkBlock}

Instagram handle (seller view): ${ctx.username}
Phone field (seller tool): ${ctx.phone}
Address field (seller tool): ${ctx.address}
Total raw messages: ${ctx.messageCount}

=== CONFIRMED BUYER MESSAGES ONLY (chronological; do not re-label) ===
${ctx.buyerConfirmed}

=== CONFIRMED SELLER MESSAGES ONLY (chronological; do not re-label) ===
${ctx.sellerConfirmed}

=== UNCERTAIN / BACKGROUND (not confirmed buyer speech; optional context only) ===
${ctx.uncertainBackground}`;
}

/** Model A — behavioral intent, sequence-aware, Pakistan / Roman Urdu. */
export function promptBehavior(ctx: TriSharedContext) {
  const criticalRole =
    ctx.attributionNote.trim().length > 0
      ? `CRITICAL: Message direction is UNRELIABLE for this run. Read every section below as one chronological conversation. Do not trust buyer vs seller labels — infer behavioral intent from content, sequence, and tone only. Do not make claims that depend on knowing which lines are truly "buyer".`
      : `CRITICAL: You never see a mixed transcript. Buyer and seller lines are already separated. Evaluate ONLY confirmed buyer lines for buyer intent. Use seller lines only to understand sequence and what was asked. Uncertain lines are weak context — never treat them as proven buyer speech.`;
  return `You are Model A (behavioral intent) for Pakistani Instagram COD commerce.

${transcriptHeader(ctx)}

${criticalRole}

Read the conversation as a TIME SEQUENCE (order matters). Compare:
- A buyer who asks price → confirms → then asks returns is different from one who asks returns → price → reluctant confirm.

Infer product type if possible (e.g. apparel, electronics, cosmetics) from buyer questions.

Typical genuine Pakistani COD buyers often: ask variant details, negotiate lightly once or twice, share phone/address when serious, use Roman Urdu with concrete logistics ("kab tak mile ga", full address, landmark).

Typical fraudulent / high-risk Pakistani COD patterns in chat: warm vague enthusiasm without logistics, deflecting contact, probing policies early to maximize refund leverage, inconsistent engagement (hot then cold).

Roman Urdu calibration (examples — not exhaustive):
- Genuine commitment often sounds like: "confirm hai", "order kar do", "address ye hai …", "number ye lo …", "jaldi dispatch", specific quantity + variant.
- Weak / performative commitment often sounds like: only "ok"/"haan" after heavy seller prompting, "theek hai" with no follow-through detail, "baad mein dekhte hain", deferring to unnamed third party without details.

You MUST output how you weighted NETWORK PROFILE history in network_history_weight_note (one sentence).

Output exactly one JSON object, no markdown:
{
  "hesitation_markers": <boolean>,
  "engagement_quality": "<high|medium|low>",
  "roman_urdu_or_mixed_register": <boolean>,
  "buyer_questions_product_specific": <boolean>,
  "product_type_inferred": "<short string or unknown>",
  "sequence_risk_note": "<one sentence on how order of messages affected risk>",
  "most_important_buyer_line": "<short quote or paraphrase>",
  "important_absence_vs_genuine_buyer": "<what a genuine buyer would usually say but is missing>",
  "network_history_weight_note": "<one sentence>",
  "notes": "<one short technical sentence, no score>"
}`;
}

/** Model B — commitment depth spectrum. */
export function promptCommitment(ctx: TriSharedContext) {
  const criticalRole =
    ctx.attributionNote.trim().length > 0
      ? `CRITICAL: Speaker roles may be wrong. Assess commitment, withdrawal, and "cannot receive" language across the full merged thread — do not restrict analysis to lines tagged buyer.`
      : `Use ONLY confirmed buyer lines for buyer commitment; seller lines provide dialogue sequence. Withdrawal / cannot-receive still override any earlier "ok".`;
  return `You are Model B (commitment depth) for Pakistani Instagram COD.

${transcriptHeader(ctx)}

${criticalRole}

If the buyer (any language) later cancels, refuses, or says delivery is impossible, set buyer_withdrew_cancelled_or_refused_order or buyer_cannot_receive_delivery_stated and treat confirmation as void.

commitment_depth_overall scale:
- "none" — no order intent
- "shallow" — minimal "ok/haan" only after seller pushed
- "moderate" — clear yes with some details or partial logistics
- "deep" — spontaneous specifics: product name/qty, delivery urgency, unprompted address/phone, ownership language

You MUST output network_history_weight_note.

Output exactly one JSON object, no markdown:
{
  "commitment_depth_overall": "<none|shallow|moderate|deep>",
  "confirmation_was_spontaneous": <boolean>,
  "corroborating_order_details_with_confirmation": <boolean>,
  "decision_ownership": "<buyer_owned|deferred_to_other|unclear>",
  "engagement_consistency": "<steady|front_loaded|dropped_off|unclear>",
  "explicit_order_confirmation": <boolean>,
  "confirmation_appears_genuine": <boolean>,
  "confirmation_appears_hesitant_or_perfunctory": <boolean>,
  "buyer_withdrew_cancelled_or_refused_order": <boolean>,
  "buyer_cannot_receive_delivery_stated": <boolean>,
  "network_history_weight_note": "<one sentence>",
  "notes": "<one short sentence>"
}`;
}

/** Model C — Pakistan-specific fraud patterns with graded strengths. */
export function promptFraud(ctx: TriSharedContext) {
  const criticalRole =
    ctx.attributionNote.trim().length > 0
      ? `CRITICAL: Role tags are unreliable — score fraud patterns from substance across the ENTIRE transcript (all sections), not only lines labeled buyer.`
      : ``;
  return `You are Model C (fraud pattern rater) for Pakistani Instagram COD / cash-on-delivery.

${transcriptHeader(ctx)}

${criticalRole ? `${criticalRole}\n\n` : ""}Rate pattern STRENGTH for each 0–3 (0 absent, 1 mild, 2 strong, 3 very strong). Mild may be innocent hesitation; high scores are dangerous.

Patterns (concrete definitions):
- confirmation_ghost: enthusiastic warm confirm but no verifiable phone/address in chat when expected for COD.
- return_extractor: detailed return/refund questions early, before real purchase commitment (probing chargeback/return leverage).
- address_tester: only city / broad area / vague landmark to see if seller ships without full address.
- price_anchor_drop: heavy negotiation, seller drops price, buyer confirms then likely to cancel or never receive.
- (Legacy booleans still required — set true if strength >= 2 for that family.)

pattern_combination_risk 0–100: elevate when MULTIPLE patterns co-occur (e.g. returns question + city-only + non-committal language). Single mild pattern should stay low.

proactive_phone_in_chat / proactive_address_in_chat: buyer volunteers in confirmed buyer lines without seller demanding.

cannot_fulfill_delivery_buyer_side: buyer states they cannot receive COD.

You MUST include network_history_weight_note.

Output exactly one JSON object, no markdown:
{
  "confirmation_ghost_strength": <0|1|2|3>,
  "return_extractor_strength": <0|1|2|3>,
  "address_tester_strength": <0|1|2|3>,
  "price_anchor_drop_strength": <0|1|2|3>,
  "pattern_combination_risk": <0-100 integer>,
  "pattern_combination_note": "<one short sentence>",
  "confirmed_without_contact": <boolean>,
  "returns_before_order": <boolean>,
  "city_only_or_vague_address": <boolean>,
  "excessive_bargaining_then_confirm": <boolean>,
  "proactive_phone_in_chat": <boolean>,
  "proactive_address_in_chat": <boolean>,
  "cannot_fulfill_delivery_buyer_side": <boolean>,
  "network_history_weight_note": "<one sentence>",
  "notes": "<one short sentence>"
}`;
}
