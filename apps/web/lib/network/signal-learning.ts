import { listRiskSignalsForBuyer } from "@/lib/db/buyers";
import { supabaseAdmin } from "@/lib/supabase/server";

const MIN_OBSERVATIONS_BEFORE_WEIGHT_SHIFT = 20;
const LEARNING_RATE = 0.08;

/**
 * Gradually adjust per-signal multipliers from real outcomes (no model training).
 * Until MIN_OBSERVATIONS_BEFORE_WEIGHT_SHIFT, multiplier stays at baseline 1.0.
 */
export async function applyOutcomeLearning(buyerId: string, outcome: string) {
  const signals = await listRiskSignalsForBuyer(buyerId);
  const delivered = outcome === "delivered";
  const bad = outcome === "fake" || outcome === "returned";

  for (const s of signals) {
    const riskSignal = s.impact < 0;
    const posSignal = s.impact > 0;
    let correct: boolean | undefined;
    if (delivered && posSignal) correct = true;
    else if (delivered && riskSignal) correct = false;
    else if (bad && riskSignal) correct = true;
    else if (bad && posSignal) correct = false;
    if (correct === undefined) continue;

    await bumpSignalStat(s.signal_name, correct);
  }
}

async function bumpSignalStat(signalName: string, correct: boolean) {
  const { data: row } = await supabaseAdmin
    .from("signal_weight_stats")
    .select("*")
    .eq("signal_name", signalName)
    .maybeSingle();

  const observations = (row?.observations ?? 0) + 1;
  const correct_predictions = (row?.correct_predictions ?? 0) + (correct ? 1 : 0);
  const prevMult = Number(row?.weight_multiplier ?? 1);

  let weight_multiplier = prevMult;
  if (observations >= MIN_OBSERVATIONS_BEFORE_WEIGHT_SHIFT) {
    const accuracy = correct_predictions / observations;
    const target = 0.75 + 0.45 * accuracy;
    weight_multiplier = prevMult * (1 - LEARNING_RATE) + target * LEARNING_RATE;
    weight_multiplier = Math.max(0.65, Math.min(1.35, weight_multiplier));
  }

  await supabaseAdmin.from("signal_weight_stats").upsert(
    {
      signal_name: signalName,
      observations,
      correct_predictions,
      weight_multiplier,
      updated_at: new Date().toISOString()
    },
    { onConflict: "signal_name" }
  );
}

export async function getSignalWeightMap(): Promise<Record<string, number>> {
  try {
    const { data, error } = await supabaseAdmin
      .from("signal_weight_stats")
      .select("signal_name, weight_multiplier, observations");
    if (error || !data?.length) return {};
    const map: Record<string, number> = {};
    for (const r of data) {
      const n = Number(r.observations ?? 0);
      const mult = Number(r.weight_multiplier ?? 1);
      map[String(r.signal_name)] = n >= MIN_OBSERVATIONS_BEFORE_WEIGHT_SHIFT ? mult : 1;
    }
    return map;
  } catch {
    return {};
  }
}
