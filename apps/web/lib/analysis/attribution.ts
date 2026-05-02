/**
 * Message direction attribution for Instagram DM capture.
 * High-confidence lines are used for buyer/seller scoring; medium are background only;
 * low / unknown are excluded from confirmed transcripts and listed as unattributed metadata.
 */

/** Minimum confidence to treat a line as having a directional role at all (medium band floor). */
export const ATTRIBUTION_LOW = 0.55;
/** Minimum confidence for “confirmed” buyer/seller lines in model inputs and primary scoring. */
export const ATTRIBUTION_HIGH = 0.72;

/** @deprecated use ATTRIBUTION_LOW — kept for imports that expect the old name */
export const ATTRIBUTION_MIN_FOR_ROLE = ATTRIBUTION_LOW;

export type AnalyzedMessage = {
  role: string;
  text: string;
  /** 0–1 confidence in the assigned `role` (seller = extension user, buyer = counterparty). */
  attribution_confidence?: number;
  /** Short codes for debugging (e.g. layout:flex-end, geometry:right). */
  attribution_signals?: string[];
};

function clamp01(n: number): number {
  if (Number.isNaN(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

/** Confidence in `role` when the extension did not send a score (legacy clients). */
export function legacyRoleConfidence(role: string): number {
  const r = String(role || "").toLowerCase();
  if (r === "buyer" || r === "seller") return 0.72;
  return 0.42;
}

/** Effective confidence in the labeled direction (extension or legacy default). */
export function effectiveRoleConfidence(m: AnalyzedMessage): number {
  if (typeof m.attribution_confidence === "number") return clamp01(m.attribution_confidence);
  return legacyRoleConfidence(m.role);
}

export function isAttributionHigh(confidence: number): boolean {
  return confidence >= ATTRIBUTION_HIGH;
}

export function isAttributionMediumBand(confidence: number, role: string): boolean {
  const r = String(role ?? "").toLowerCase();
  if (r !== "buyer" && r !== "seller") return false;
  return confidence >= ATTRIBUTION_LOW && confidence < ATTRIBUTION_HIGH;
}

export type AttributionCounts = {
  total: number;
  /** High-confidence buyer lines (primary scoring / confirmed transcript). */
  buyer_for_scoring: number;
  /** High-confidence seller lines. */
  seller_labeled: number;
  /** Medium-band + unknown/low (not confirmed for either side). */
  uncertain: number;
  buyer_high: number;
  seller_high: number;
  buyer_medium: number;
  seller_medium: number;
  unattributed_low: number;
};

export function summarizeAttribution(messages: AnalyzedMessage[]): AttributionCounts {
  let buyer_high = 0;
  let seller_high = 0;
  let buyer_medium = 0;
  let seller_medium = 0;
  let unattributed_low = 0;
  let total = 0;

  for (const m of messages) {
    const t = String(m.text ?? "").trim();
    if (!t.length) continue;
    total++;
    const c = effectiveRoleConfidence(m);
    const r = String(m.role ?? "").toLowerCase();

    if (r === "unknown" || c < ATTRIBUTION_LOW) {
      unattributed_low++;
      continue;
    }
    if (r === "buyer") {
      if (isAttributionHigh(c)) buyer_high++;
      else buyer_medium++;
    } else if (r === "seller") {
      if (isAttributionHigh(c)) seller_high++;
      else seller_medium++;
    } else {
      unattributed_low++;
    }
  }

  const uncertain = buyer_medium + seller_medium + unattributed_low;

  return {
    total,
    buyer_for_scoring: buyer_high,
    seller_labeled: seller_high,
    uncertain,
    buyer_high,
    seller_high,
    buyer_medium,
    seller_medium,
    unattributed_low
  };
}

export type AttributionSanityResult =
  | { ok: true }
  | { ok: false; code: "ATTRIBUTION_ONE_SIDED"; message: string; detail: AttributionCounts };

/**
 * If the chat is long enough to expect a dialogue but we have zero high-confidence buyer
 * or seller lines, attribution is unreliable — block before any model call.
 */
export function checkAttributionSanity(messages: AnalyzedMessage[]): AttributionSanityResult {
  const detail = summarizeAttribution(messages);
  const MIN_MESSAGES = 5;
  if (detail.total < MIN_MESSAGES) return { ok: true };
  if (detail.buyer_high === 0 || detail.seller_high === 0) {
    return {
      ok: false,
      code: "ATTRIBUTION_ONE_SIDED",
      message:
        "Message attribution is unreliable for this chat: we could not confidently separate buyer and seller lines. Fix alignment in the extension or retry before running analysis.",
      detail
    };
  }
  return { ok: true };
}

/** Chronological confirmed buyer lines only (no mixing with seller). */
export function formatBuyerConfirmedTranscript(messages: AnalyzedMessage[]): string {
  const lines: string[] = [];
  let i = 0;
  for (const m of messages) {
    const t = String(m.text ?? "").trim();
    if (!t.length) continue;
    const r = String(m.role ?? "").toLowerCase();
    if (r !== "buyer") continue;
    const c = effectiveRoleConfidence(m);
    if (!isAttributionHigh(c)) continue;
    i++;
    lines.push(`[B${i} | conf=${c.toFixed(2)}] ${t}`);
  }
  return lines.join("\n");
}

/** Chronological confirmed seller lines only. */
export function formatSellerConfirmedTranscript(messages: AnalyzedMessage[]): string {
  const lines: string[] = [];
  let i = 0;
  for (const m of messages) {
    const t = String(m.text ?? "").trim();
    if (!t.length) continue;
    const r = String(m.role ?? "").toLowerCase();
    if (r !== "seller") continue;
    const c = effectiveRoleConfidence(m);
    if (!isAttributionHigh(c)) continue;
    i++;
    lines.push(`[S${i} | conf=${c.toFixed(2)}] ${t}`);
  }
  return lines.join("\n");
}

/**
 * Medium-confidence directional lines + unattributed content. Models must not treat this as confirmed buyer speech.
 */
export function formatUncertainContextTranscript(messages: AnalyzedMessage[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    const t = String(m.text ?? "").trim();
    if (!t.length) continue;
    const c = effectiveRoleConfidence(m);
    const r = String(m.role ?? "").toLowerCase();

    if ((r === "buyer" || r === "seller") && isAttributionHigh(c)) continue;

    if (r === "buyer" && isAttributionMediumBand(c, r)) {
      lines.push(`[BUYER? uncertain background | conf=${c.toFixed(2)}] ${t}`);
      continue;
    }
    if (r === "seller" && isAttributionMediumBand(c, r)) {
      lines.push(`[SELLER? uncertain background | conf=${c.toFixed(2)}] ${t}`);
      continue;
    }
    if (r === "unknown" || c < ATTRIBUTION_LOW || (r !== "buyer" && r !== "seller")) {
      lines.push(`[UNATTRIBUTED | conf=${c.toFixed(2)} role=${r}] ${t}`);
    }
  }
  return lines.join("\n");
}

/** @deprecated Prefer formatBuyerConfirmedTranscript — kept for legacy callers / logging. */
export function formatFullContextTranscript(messages: AnalyzedMessage[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    const t = String(m.text ?? "").trim();
    if (!t.length) continue;
    const c = effectiveRoleConfidence(m);
    const r = String(m.role ?? "").toLowerCase();
    let tag = r;
    if (c < ATTRIBUTION_LOW || r === "unknown") {
      tag = `unattributed(conf=${c.toFixed(2)})`;
    } else if (isAttributionMediumBand(c, r)) {
      tag = `${r}_uncertain(conf=${c.toFixed(2)})`;
    } else {
      tag = `${r}_confirmed(conf=${c.toFixed(2)})`;
    }
    lines.push(`[${tag}] ${t}`);
  }
  return lines.join("\n");
}

/**
 * Only high-confidence buyer lines (primary behavioral scoring transcript).
 * @deprecated Name kept for OpenRouter fallback — same as confirmed buyer transcript body.
 */
export function formatBuyerScoringTranscript(messages: AnalyzedMessage[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    const t = String(m.text ?? "").trim();
    if (!t.length) continue;
    const r = String(m.role ?? "").toLowerCase();
    if (r !== "buyer") continue;
    if (!isAttributionHigh(effectiveRoleConfidence(m))) continue;
    lines.push(`buyer: ${t}`);
  }
  return lines.join("\n");
}

export function logAttributionSummary(prefix: string, messages: AnalyzedMessage[]): void {
  const c = summarizeAttribution(messages);
  console.log(`[${prefix}] attribution summary:`, {
    ...c,
    buyer_high_pct: c.total ? Math.round((c.buyer_high / c.total) * 100) : 0,
    uncertain_pct: c.total ? Math.round((c.uncertain / c.total) * 100) : 0
  });
}
