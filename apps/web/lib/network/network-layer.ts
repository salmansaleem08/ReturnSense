import { supabaseAdmin } from "@/lib/supabase/server";

import { hashInstagramUsername, hashPhoneDigits } from "@/lib/network/hash";

export type NetworkIgRow = {
  username_hash: string;
  delivered_count: number;
  returned_count: number;
  fake_count: number;
  cancelled_count: number;
  total_marked: number;
};

export type NetworkTrustSeverity = "good" | "warn" | "bad" | "neutral";

export type NetworkProfilePayload = {
  has_profile: boolean;
  total_analyses: number;
  delivered: number;
  returned: number;
  fake: number;
  cancelled: number;
  trust_label: string;
  trust_severity: NetworkTrustSeverity;
  /** 0–100 heuristic from cross-seller outcomes (for models / UI). */
  network_trust_score: number;
  distinct_sellers: number | null;
};

function num(n: unknown): number {
  const x = Number(n);
  return Number.isFinite(x) ? x : 0;
}

/**
 * Simple cross-seller trust score from aggregates (not a model). Used as structured prior for tri + synthesis.
 */
export function computeNetworkTrustScore(row: NetworkIgRow): number {
  const t = num(row.total_marked);
  const d = num(row.delivered_count);
  const r = num(row.returned_count);
  const f = num(row.fake_count);
  if (t <= 0) return 50;
  let s = 50 + (d / t) * 35 - (r / t) * 25 - (f / t) * 55;
  if (f >= 2) s -= 20;
  else if (f === 1) s -= 12;
  return Math.round(Math.max(5, Math.min(95, s)));
}

export function computeNetworkTrustLabel(row: NetworkIgRow | null): {
  label: string;
  severity: NetworkTrustSeverity;
} | null {
  if (!row || num(row.total_marked) < 1) return null;
  const t = num(row.total_marked);
  const d = num(row.delivered_count);
  const r = num(row.returned_count);
  const f = num(row.fake_count);

  if (f >= 2 || (t >= 3 && f / t >= 0.34)) {
    return { label: "Confirmed fraud risk (network)", severity: "bad" };
  }
  if (f === 1) {
    return { label: "Prior fake order on network", severity: "bad" };
  }
  if (t >= 2 && r / t > 0.45) {
    return { label: "Flagged for returns", severity: "warn" };
  }
  if (d >= 8 && f === 0 && r === 0) {
    return { label: "Verified buyer pattern", severity: "good" };
  }
  if (d >= 3 && f === 0 && r / t < 0.25) {
    return { label: "Low risk (network)", severity: "good" };
  }
  if (d > r && f === 0) {
    return { label: "Mostly successful deliveries", severity: "good" };
  }
  return { label: "Network history present", severity: "neutral" };
}

export function buildNetworkProfilePayload(
  row: NetworkIgRow | null,
  distinctSellers: number | null
): NetworkProfilePayload {
  if (!row || num(row.total_marked) < 1) {
    return {
      has_profile: false,
      total_analyses: 0,
      delivered: 0,
      returned: 0,
      fake: 0,
      cancelled: 0,
      trust_label: "No cross-seller history",
      trust_severity: "neutral",
      network_trust_score: 50,
      distinct_sellers: distinctSellers ?? 0
    };
  }
  const tl = computeNetworkTrustLabel(row);
  return {
    has_profile: true,
    total_analyses: num(row.total_marked),
    delivered: num(row.delivered_count),
    returned: num(row.returned_count),
    fake: num(row.fake_count),
    cancelled: num(row.cancelled_count),
    trust_label: tl?.label ?? "Network history present",
    trust_severity: tl?.severity ?? "neutral",
    network_trust_score: computeNetworkTrustScore(row),
    distinct_sellers: distinctSellers
  };
}

/** Multi-line block injected into all tri-model prompts. */
export function formatNetworkProfileForPrompt(payload: NetworkProfilePayload): string {
  if (!payload.has_profile) {
    return `NETWORK PROFILE (hashed Instagram handle across ReturnSense sellers):
No prior cross-seller outcome aggregates on file for this handle. Treat chat-only signals as primary; do not infer missing history.`;
  }
  const ratio = `${payload.delivered} delivered, ${payload.returned} returned, ${payload.fake} fake, ${payload.cancelled} cancelled`;
  const sellers =
    payload.distinct_sellers != null && payload.distinct_sellers > 0
      ? `${payload.distinct_sellers} distinct seller workspace(s) contributed outcomes.`
      : "Distinct seller count unavailable.";
  return `NETWORK PROFILE (hashed Instagram handle — verified transaction outcomes from other sellers, more reliable than chat inference):
Total analyses with marked outcomes: ${payload.total_analyses}.
Outcome ratio: ${ratio}.
Computed network trust score (heuristic 0–100): ${payload.network_trust_score}.
Trust label: ${payload.trust_label}.
${sellers}
You MUST factor this history into your assessment and briefly state how you weighted it in your JSON field network_history_weight_note.`;
}

export async function getDistinctSellerCountForIg(username: string): Promise<number> {
  try {
    const username_hash = hashInstagramUsername(username);
    const { data, error } = await supabaseAdmin
      .from("outcome_ledger")
      .select("seller_id")
      .eq("ig_username_hash", username_hash);
    if (error) {
      console.warn("[RS-NET] distinct sellers read skipped:", error.message);
      return 0;
    }
    if (!data?.length) return 0;
    const set = new Set<string>();
    for (const row of data) {
      if (row.seller_id != null) set.add(String(row.seller_id));
    }
    return set.size;
  } catch (e) {
    console.warn("[RS-NET] distinct sellers failed:", e);
    return 0;
  }
}

export async function getNetworkIgStats(username: string): Promise<NetworkIgRow | null> {
  try {
    const username_hash = hashInstagramUsername(username);
    const { data, error } = await supabaseAdmin
      .from("network_ig_outcomes")
      .select("*")
      .eq("username_hash", username_hash)
      .maybeSingle();
    if (error) {
      console.warn("[RS-NET] network read skipped:", error.message);
      return null;
    }
    return data as NetworkIgRow | null;
  } catch (e) {
    console.warn("[RS-NET] network read failed:", e);
    return null;
  }
}

/**
 * Cross-seller aggregate counts + durable ledger row (survives seller soft-delete).
 */
export async function recordNetworkOutcome(args: {
  buyerId: string;
  sellerId: string;
  instagramUsername: string;
  phoneNumber: string | null;
  outcome: "delivered" | "returned" | "fake" | "cancelled";
}) {
  const ig_hash = hashInstagramUsername(args.instagramUsername);
  const phone_hash = args.phoneNumber ? hashPhoneDigits(args.phoneNumber) : null;

  const ins = await supabaseAdmin.from("outcome_ledger").insert({
    ig_username_hash: ig_hash,
    phone_hash,
    outcome: args.outcome,
    buyer_id: args.buyerId,
    seller_id: args.sellerId
  });
  if (ins.error) {
    console.warn("[RS-NET] outcome_ledger insert skipped:", ins.error.message);
    return;
  }

  const { data: existing } = await supabaseAdmin
    .from("network_ig_outcomes")
    .select("*")
    .eq("username_hash", ig_hash)
    .maybeSingle();

  const row = existing ?? {
    username_hash: ig_hash,
    delivered_count: 0,
    returned_count: 0,
    fake_count: 0,
    cancelled_count: 0,
    total_marked: 0
  };

  const next = { ...row };
  next.total_marked = Number(next.total_marked) + 1;
  if (args.outcome === "delivered") next.delivered_count = Number(next.delivered_count) + 1;
  if (args.outcome === "returned") next.returned_count = Number(next.returned_count) + 1;
  if (args.outcome === "fake") next.fake_count = Number(next.fake_count) + 1;
  if (args.outcome === "cancelled") next.cancelled_count = Number(next.cancelled_count) + 1;

  const up = await supabaseAdmin.from("network_ig_outcomes").upsert(
    {
      username_hash: ig_hash,
      delivered_count: next.delivered_count,
      returned_count: next.returned_count,
      fake_count: next.fake_count,
      cancelled_count: next.cancelled_count,
      total_marked: next.total_marked,
      updated_at: new Date().toISOString()
    },
    { onConflict: "username_hash" }
  );
  if (up.error) console.warn("[RS-NET] network_ig_outcomes upsert skipped:", up.error.message);
}
