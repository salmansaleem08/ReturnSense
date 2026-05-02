import type { NetworkProfilePayload } from "@/lib/network/network-layer";

function stripJson(text: string): string {
  return text.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const cleaned = stripJson(raw);
  try {
    const v = JSON.parse(cleaned) as Record<string, unknown>;
    return v && typeof v === "object" ? v : null;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) return null;
    try {
      const v = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
      return v && typeof v === "object" ? v : null;
    } catch {
      return null;
    }
  }
}

const SYSTEM = `You write the final seller-facing narrative for ReturnSense. Output exactly one JSON object. No markdown. Keys: analyst_notes, recommendation only.`;

/**
 * Final synthesis after tri models, validators, and deterministic score — produces integrated
 * analyst_notes + recommendation from the full evidence stack (Improvement Eight).
 */
export async function synthesizeAnalystNarrative(args: {
  triRaw: Record<string, unknown>;
  networkProfile: NetworkProfilePayload;
  phoneDigest: string;
  addressDigest: string;
  finalScore: number;
  riskLevel: string;
  signalsDigest: string;
  triRecommendationPrior: string;
}): Promise<{ analyst_notes: string; recommendation: string; raw: Record<string, unknown> } | null> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) return null;

  const model =
    process.env.RS_TRI_MODEL_SYNTHESIS?.trim() || process.env.RS_TRI_MODEL_BEHAVIOR?.trim() || "mistralai/mistral-small-3.1-24b-instruct:free";

  const payload = {
    final_trust_score: args.finalScore,
    final_risk_level: args.riskLevel,
    network_profile: args.networkProfile,
    phone_digest: args.phoneDigest,
    address_digest: args.addressDigest,
    tri_model_outputs: {
      behavior: args.triRaw.behavior ?? null,
      commitment: args.triRaw.commitment ?? null,
      fraud: args.triRaw.fraud ?? null,
      conflict_resolutions: args.triRaw.conflict_resolutions ?? [],
      tri_recommendation_prior: args.triRecommendationPrior
    },
    scoring_signals: args.signalsDigest
  };

  const user = `You are a senior COD fraud analyst in Pakistan e-commerce. Write concise analyst_notes (2–4 sentences) that INTEGRATE:
- Tri-model branches (behavior, commitment depth, fraud patterns, any conflict resolutions — explain overrides briefly),
- Phone and address validation digests,
- Cross-seller network profile when present (this outweighs rosy chat if history shows fakes).

Tone: professional, calm, actionable. Cite the strongest 1–2 facts, not a bullet list.

recommendation must be exactly one of: proceed | caution | hold | reject — chosen from the FULL picture (not tri alone). It should align with final_trust_score:
70+ proceed, 50–69 caution, 30–49 hold, <30 reject unless network history forces reject earlier.

JSON only:
{
  "analyst_notes": "<2-4 sentences>",
  "recommendation": "<proceed|caution|hold|reject>"
}

Evidence JSON:
${JSON.stringify(payload)}`;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: user }
      ],
      temperature: 0,
      top_p: 1,
      max_tokens: 600,
      seed: 90099009
    })
  });

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  const text = data?.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") {
    console.warn("[RS-SYNTH] empty response", data?.error?.message);
    return null;
  }
  const parsed = parseJsonObject(text);
  if (!parsed) return null;
  const notes = String(parsed.analyst_notes ?? "").trim();
  const rec = String(parsed.recommendation ?? "caution").toLowerCase();
  const recommendation = ["proceed", "caution", "hold", "reject"].includes(rec) ? rec : "caution";
  if (!notes.length) return null;
  return { analyst_notes: notes, recommendation, raw: parsed };
}
