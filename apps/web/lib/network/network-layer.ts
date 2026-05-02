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
