import { supabaseAdmin } from "@/lib/supabase/server";

type BuyerInsert = Record<string, unknown>;
type SignalInsert = {
  signal_type: "chat" | "address" | "phone" | "history";
  signal_name: string;
  impact: number;
  description: string;
};

export async function saveBuyer(data: BuyerInsert) {
  const { data: buyer, error } = await supabaseAdmin.from("buyers").insert(data).select("*").single();
  if (error) throw new Error(error.message);
  return buyer;
}

export async function saveSignals(buyerId: string, signals: SignalInsert[]) {
  if (!signals.length) return [];
  const payload = signals.map((signal) => ({ buyer_id: buyerId, ...signal }));
  const { data, error } = await supabaseAdmin.from("risk_signals").insert(payload).select("*");
  if (error) throw new Error(error.message);
  return data;
}

export async function getHistoricalData(phone?: string | null, username?: string | null) {
  if (!phone && !username) return [];
  const filters: string[] = [];
  if (phone) filters.push(`phone_number.eq.${phone}`);
  if (username) filters.push(`instagram_username.eq.${username}`);
  const { data, error } = await supabaseAdmin
    .from("buyers")
    .select("outcome")
    .or(filters.join(","))
    .not("outcome", "eq", "pending");
  if (error) throw new Error(error.message);
  return data || [];
}

export async function getBuyers(sellerId: string, page = 1, limit = 20) {
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const { data, error, count } = await supabaseAdmin
    .from("buyers")
    .select("*,risk_signals(count)", { count: "exact" })
    .eq("seller_id", sellerId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) throw new Error(error.message);

  return {
    items: data || [],
    total: count || 0,
    page,
    limit
  };
}

export async function getBuyerById(buyerId: string, sellerId: string) {
  const { data, error } = await supabaseAdmin
    .from("buyers")
    .select("*,risk_signals(*)")
    .eq("id", buyerId)
    .eq("seller_id", sellerId)
    .single();
  if (error) throw new Error(error.message);
  return data;
}

export async function updateOutcome(
  buyerId: string,
  sellerId: string,
  outcome: "delivered" | "returned" | "fake" | "cancelled",
  notes?: string
) {
  const { data, error } = await supabaseAdmin
    .from("buyers")
    .update({
      outcome,
      outcome_notes: notes ?? null,
      outcome_marked_at: new Date().toISOString()
    })
    .eq("id", buyerId)
    .eq("seller_id", sellerId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data;
}
