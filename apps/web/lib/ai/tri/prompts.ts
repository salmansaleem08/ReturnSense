import {
  formatBuyerScoringTranscript,
  formatFullContextTranscript,
  type AnalyzedMessage
} from "@/lib/analysis/attribution";
import type { ChatMessage } from "@/lib/ai/openrouter";

function toAnalyzed(messages: ChatMessage[]): AnalyzedMessage[] {
  return messages.map((m) => ({
    role: m.role,
    text: m.text,
    attribution_confidence: m.attribution_confidence,
    attribution_signals: m.attribution_signals
  }));
}

export function buildTriSharedContext(messages: ChatMessage[], username: string, phone: string, address: string) {
  const a = toAnalyzed(messages);
  return {
    full: formatFullContextTranscript(a),
    buyerScoring: formatBuyerScoringTranscript(a),
    username,
    phone,
    address,
    messageCount: String(messages.length)
  };
}

/** Model A — behavioral intent, Urdu / Roman Urdu nuance. Output JSON only, no score. */
export function promptBehavior(ctx: ReturnType<typeof buildTriSharedContext>) {
  return `You are Model A (behavioral intent). Analyze ONLY the buyer-role scoring lines for intent and tone. Full thread is background.

FULL THREAD (context):
${ctx.full}

BUYER-SCORING LINES (primary):
${ctx.buyerScoring || "(none)"}

Username: ${ctx.username}
Phone submitted: ${ctx.phone}
Address submitted: ${ctx.address}
Messages: ${ctx.messageCount}

Output exactly one JSON object, no markdown:
{
  "hesitation_markers": <boolean>,
  "engagement_quality": "<high|medium|low>",
  "roman_urdu_or_mixed_register": <boolean>,
  "buyer_questions_product_specific": <boolean>,
  "notes": "<one short sentence>"
}`;
}

/** Model B — commitment / authenticity of confirmation. */
export function promptCommitment(ctx: ReturnType<typeof buildTriSharedContext>) {
  return `You are Model B (commitment authenticity). Judge whether any ORDER CONFIRMATION from the buyer is genuine vs hesitant/vague. Use buyer-scoring lines first.

FULL THREAD:
${ctx.full}

BUYER-SCORING LINES:
${ctx.buyerScoring || "(none)"}

Output exactly one JSON object, no markdown:
{
  "explicit_order_confirmation": <boolean>,
  "confirmation_appears_genuine": <boolean>,
  "confirmation_appears_hesitant_or_perfunctory": <boolean>,
  "notes": "<one short sentence>"
}`;
}

/** Model C — Pakistani COD fraud pattern checklist. */
export function promptFraud(ctx: ReturnType<typeof buildTriSharedContext>) {
  return `You are Model C (fraud patterns). Match buyer-side behavior (buyer-scoring lines + relevant context) against common Pakistani COD risk patterns. Do not infer demographics.

Patterns to detect (booleans):
- confirmed_without_contact: buyer confirms order but no phone/address shared in chat when that would be expected
- returns_before_order: buyer asks return/refund policy before confirming
- city_only_or_vague_address: only city/area, no street/house when discussing delivery
- excessive_bargaining_then_confirm: multiple price haggles then sudden okay
- proactive_phone_in_chat: buyer volunteers phone without being asked
- proactive_address_in_chat: buyer volunteers detailed delivery address without being asked

FULL THREAD:
${ctx.full}

BUYER-SCORING LINES:
${ctx.buyerScoring || "(none)"}

Phone field submitted by seller tool: ${ctx.phone}
Address field submitted by seller tool: ${ctx.address}

Output exactly one JSON object, no markdown:
{
  "confirmed_without_contact": <boolean>,
  "returns_before_order": <boolean>,
  "city_only_or_vague_address": <boolean>,
  "excessive_bargaining_then_confirm": <boolean>,
  "proactive_phone_in_chat": <boolean>,
  "proactive_address_in_chat": <boolean>,
  "notes": "<one short sentence>"
}`;
}
