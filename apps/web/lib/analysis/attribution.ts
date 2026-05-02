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

/** Server-side quality gate: analysis always runs; models get a warning when direction is untrustworthy. */
export type AttributionQuality = {
  degraded: boolean;
  /** When true, extension/dashboard should warn that buyer vs seller labels may be wrong. */
  unreliable: boolean;
  reason: "one_side_missing" | "heavy_skew" | null;
  /** Among high-confidence directional lines only: max(buyer,seller) / (buyer+seller). */
  skew_ratio: number | null;
  /** Injected into tri / single-model prompts when degraded. */
  note_for_prompt: string;
};

const MIN_MESSAGES_LONG_CHAT = 5;
const SKEW_SINGLE_SIDE_FRACTION = 0.8;

/**
 * When extension direction labels are one-sided or >80% skewed at high confidence, mark degraded
 * and pass an explicit prompt warning — do not block the API (real chat data is still useful).
 */
export function computeAttributionQuality(counts: AttributionCounts): AttributionQuality {
  const total = counts.total;
  const bh = counts.buyer_high;
  const sh = counts.seller_high;
  const highDir = bh + sh;

  let degraded = false;
  let unreliable = false;
  let reason: AttributionQuality["reason"] = null;
  let skew_ratio: number | null = null;

  if (total >= MIN_MESSAGES_LONG_CHAT && (bh === 0 || sh === 0)) {
    degraded = true;
    unreliable = true;
    reason = "one_side_missing";
  }

  if (highDir >= MIN_MESSAGES_LONG_CHAT) {
    const maxSide = Math.max(bh, sh);
    skew_ratio = maxSide / highDir;
    if (skew_ratio > SKEW_SINGLE_SIDE_FRACTION) {
      degraded = true;
      unreliable = true;
      reason = reason ?? "heavy_skew";
    }
  }

  let note_for_prompt = "";
  if (degraded) {
    if (reason === "one_side_missing") {
      note_for_prompt =
        "ATTRIBUTION FAILED: High-confidence buyer and/or seller labels are missing on one side. " +
        "Treat the entire conversation as ONE chronological thread. Ignore buyer vs seller section labels — they are not trustworthy for this run. " +
        "Assess behavior only from what was said (substance, sequence, logistics language), not from who the UI claimed spoke. " +
        "State conclusions cautiously and avoid buyer-specific claims that depend on correct attribution.";
    } else {
      note_for_prompt =
        "ATTRIBUTION FAILED: High-confidence labels are heavily skewed to one side (>80%). " +
        "Merge CONFIRMED BUYER, CONFIRMED SELLER, and UNCERTAIN blocks mentally into a single timeline. " +
        "Do not assume speaker roles are correct. Judge patterns from words and order alone; do not score as if attribution were reliable.";
    }
  }

  return { degraded, unreliable, reason, skew_ratio, note_for_prompt };
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
