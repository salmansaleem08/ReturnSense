import type { AiStructuredResult } from "@/lib/ai/openrouter";
import type { ChatMessage } from "@/lib/ai/openrouter";
import { aggregateTriSignals } from "@/lib/ai/tri/aggregate";
import { buildTriSharedContext, promptBehavior, promptCommitment, promptFraud } from "@/lib/ai/tri/prompts";

const SYSTEM_JSON = `You output exactly one JSON object. No markdown fences. No keys except those requested.`;

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

async function callOpenRouterJson(model: string, userContent: string): Promise<Record<string, unknown> | null> {
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) return null;

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: SYSTEM_JSON },
        { role: "user", content: userContent }
      ],
      temperature: 0,
      top_p: 1,
      max_tokens: 1024,
      seed: 13371338
    })
  });

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }>; error?: { message?: string } };
  const text = data?.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") {
    console.warn("[RS-TRI] empty response", model, data?.error?.message);
    return null;
  }
  return parseJsonObject(text);
}

export function triEngineEnabled(): boolean {
  if (process.env.RS_USE_TRI_ENGINE?.trim() === "false") return false;
  return Boolean(process.env.OPENROUTER_API_KEY?.trim());
}

/**
 * Three parallel OpenRouter calls (behavior / commitment / fraud); deterministic aggregate only.
 * Partial results ok — aggregate applies small penalty for missing branches.
 */
export async function analyzeTriModel(
  messages: ChatMessage[],
  username: string,
  phoneProvided?: string | null,
  addressProvided?: string | null
): Promise<AiStructuredResult> {
  const phone = phoneProvided?.trim()?.length ? phoneProvided.trim() : "Not provided";
  const address = addressProvided?.trim()?.length ? addressProvided.trim() : "Not provided";
  const ctx = buildTriSharedContext(messages, username, phone, address);

  const mBehavior = process.env.RS_TRI_MODEL_BEHAVIOR?.trim() || "mistralai/mistral-small-3.1-24b-instruct:free";
  const mCommit = process.env.RS_TRI_MODEL_COMMITMENT?.trim() || "deepseek/deepseek-chat";
  const mFraud = process.env.RS_TRI_MODEL_FRAUD?.trim() || "deepseek/deepseek-chat";

  const settled = await Promise.allSettled([
    callOpenRouterJson(mBehavior, promptBehavior(ctx)),
    callOpenRouterJson(mCommit, promptCommitment(ctx)),
    callOpenRouterJson(mFraud, promptFraud(ctx))
  ]);

  const behavior = settled[0].status === "fulfilled" ? settled[0].value : null;
  const commitment = settled[1].status === "fulfilled" ? settled[1].value : null;
  const fraud = settled[2].status === "fulfilled" ? settled[2].value : null;

  const behavior_ok = behavior != null;
  const commitment_ok = commitment != null;
  const fraud_ok = fraud != null;

  if (!behavior_ok && !commitment_ok && !fraud_ok) {
    throw new Error("All tri-model branches failed");
  }

  console.log("[RS-TRI] branch status:", { behavior_ok, commitment_ok, fraud_ok });

  return aggregateTriSignals(
    behavior_ok ? (behavior as Record<string, unknown>) : null,
    commitment_ok ? (commitment as Record<string, unknown>) : null,
    fraud_ok ? (fraud as Record<string, unknown>) : null,
    { behavior_ok, commitment_ok, fraud_ok }
  );
}
