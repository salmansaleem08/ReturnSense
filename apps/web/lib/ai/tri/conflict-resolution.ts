/**
 * Tri-model signal conflict resolution (seller-safe).
 *
 * When two model branches produce contradictory interpretations of the same behavioral
 * dimension, we resolve using explicit rules instead of letting opposing numeric adjustments
 * cancel arbitrarily. Calibration: false negatives on fraud are more costly than false
 * positives — err toward caution.
 *
 * Rules (stable IDs for UI / `signal_conflicts_resolved`):
 * - CR-1: Strong "confirmation ghost" vs strong "genuine enthusiasm" → fraud interpretation wins; dampen engagement bonus path.
 * - CR-2: Strong return-extractor pattern vs deep spontaneous commitment → fraud path wins for return-timing concern.
 * - CR-3: High commitment depth score vs strong confirmation_ghost → cap commitment uplift; ghost dominates contact-truth.
 */

export type ConflictResolutionEntry = {
  rule_id: string;
  resolution: string;
  favored: "fraud_caution" | "behavior_neutralized";
};

export type ConflictResolutionResult = {
  entries: ConflictResolutionEntry[];
  /** Multiplier 0–1 applied to engagement-driven score bonus from Model A. */
  engagement_bonus_factor: number;
  /** Extra penalty bucket for aggregate (subtracted after base fraud penalties). */
  extra_fraud_penalty: number;
  /** Reduce commitment-depth bonus when ghost contradicts depth. */
  commitment_depth_factor: number;
};

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function strength(v: unknown): number {
  return Math.max(0, Math.min(3, Math.round(num(v))));
}

export function resolveTriConflicts(args: {
  behavior: Record<string, unknown> | null;
  commitment: Record<string, unknown> | null;
  fraud: Record<string, unknown> | null;
}): ConflictResolutionResult {
  const b = args.behavior;
  const c = args.commitment;
  const f = args.fraud;

  const entries: ConflictResolutionEntry[] = [];
  let engagement_bonus_factor = 1;
  let extra_fraud_penalty = 0;
  let commitment_depth_factor = 1;

  const eq = String(b?.engagement_quality ?? "medium").toLowerCase();
  const hesitation = b?.hesitation_markers === true;
  const ghost = Math.max(
    strength(f?.confirmation_ghost_strength),
    f?.confirmed_without_contact === true ? 2 : 0
  );
  const returnEx = strength(f?.return_extractor_strength ?? (f?.returns_before_order === true ? 2 : 0));

  const depthRaw = String(c?.commitment_depth_overall ?? "moderate").toLowerCase();
  const deepCommit =
    depthRaw === "deep" ||
    (c?.corroborating_order_details_with_confirmation === true && c?.confirmation_was_spontaneous === true);

  // CR-1
  if (ghost >= 2 && eq === "high" && !hesitation) {
    entries.push({
      rule_id: "CR-1",
      resolution:
        "Behavioral branch read strong engagement, but fraud branch flagged confirmation-without-contact (ghost). Seller-safe rule: fraud signal takes priority; enthusiasm treated as non-verifying.",
      favored: "fraud_caution"
    });
    engagement_bonus_factor = 0.35;
    extra_fraud_penalty += 8;
  }

  // CR-2
  if (returnEx >= 2 && deepCommit) {
    entries.push({
      rule_id: "CR-2",
      resolution:
        "Commitment reads deep/spontaneous, but return-policy probing before order (extractor pattern) conflicts. Seller-safe rule: early return focus in Pakistani COD context outweighs shallow commitment uplift.",
      favored: "fraud_caution"
    });
    commitment_depth_factor = 0.5;
    extra_fraud_penalty += 6;
  }

  // CR-3
  if (ghost >= 2 && deepCommit) {
    entries.push({
      rule_id: "CR-3",
      resolution:
        "High commitment depth coexists with strong confirmation-ghost (warm words, no verifiable contact in-chat). Verified contact truth dominates: commitment depth bonus is capped.",
      favored: "fraud_caution"
    });
    commitment_depth_factor = Math.min(commitment_depth_factor, 0.45);
    extra_fraud_penalty += 4;
  }

  return { entries, engagement_bonus_factor, extra_fraud_penalty, commitment_depth_factor };
}
