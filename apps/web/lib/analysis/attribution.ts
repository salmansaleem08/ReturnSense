/**
 * Message direction attribution for Instagram DM capture.
 * Low-confidence lines are context-only; buyer-behavior rubric applies only to high-confidence buyer lines.
 */

export const ATTRIBUTION_MIN_FOR_ROLE = 0.55;

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

export type AttributionCounts = {
  total: number;
  buyer_for_scoring: number;
  seller_labeled: number;
  uncertain: number;
};

export function summarizeAttribution(messages: AnalyzedMessage[]): AttributionCounts {
  let buyer_for_scoring = 0;
  let seller_labeled = 0;
  let uncertain = 0;
  let total = 0;

  for (const m of messages) {
    const t = String(m.text ?? "").trim();
    if (!t.length) continue;
    total++;
    const c = effectiveRoleConfidence(m);
    const r = String(m.role ?? "").toLowerCase();

    if (c < ATTRIBUTION_MIN_FOR_ROLE || r === "unknown") {
      uncertain++;
      continue;
    }
    if (r === "buyer") buyer_for_scoring++;
    else if (r === "seller") seller_labeled++;
    else uncertain++;
  }

  return { total, buyer_for_scoring, seller_labeled, uncertain };
}

/** Full thread for model context (includes uncertain; labels show reliability). */
export function formatFullContextTranscript(messages: AnalyzedMessage[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    const t = String(m.text ?? "").trim();
    if (!t.length) continue;
    const c = effectiveRoleConfidence(m);
    const r = String(m.role ?? "").toLowerCase();
    let tag = r;
    if (c < ATTRIBUTION_MIN_FOR_ROLE || r === "unknown") {
      tag = `uncertain(conf=${c.toFixed(2)})`;
    } else {
      tag = `${r}(conf=${c.toFixed(2)})`;
    }
    lines.push(`[${tag}] ${t}`);
  }
  return lines.join("\n");
}

/**
 * Only messages we treat as counterparty speech for buyer-behavior scoring.
 * Seller lines must never be scored as buyer behavior.
 */
export function formatBuyerScoringTranscript(messages: AnalyzedMessage[]): string {
  const lines: string[] = [];
  for (const m of messages) {
    const t = String(m.text ?? "").trim();
    if (!t.length) continue;
    const r = String(m.role ?? "").toLowerCase();
    if (r !== "buyer") continue;
    if (effectiveRoleConfidence(m) < ATTRIBUTION_MIN_FOR_ROLE) continue;
    lines.push(`buyer: ${t}`);
  }
  return lines.join("\n");
}

export function logAttributionSummary(prefix: string, messages: AnalyzedMessage[]): void {
  const c = summarizeAttribution(messages);
  console.log(`[${prefix}] attribution summary:`, {
    ...c,
    buyer_pct: c.total ? Math.round((c.buyer_for_scoring / c.total) * 100) : 0,
    uncertain_pct: c.total ? Math.round((c.uncertain / c.total) * 100) : 0
  });
}
