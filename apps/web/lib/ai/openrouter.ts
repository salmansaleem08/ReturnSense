import { RS_ANALYST_V1_TEMPLATE } from "@/lib/ai/rs-analyst-v1";

export interface ChatMessage {
  role: string;
  text: string;
  timestamp?: string | null;
}

export interface AiStructuredResult {
  ai_trust_score: number;
  ai_risk_level: string;
  ai_hesitation_detected: boolean;
  ai_buyer_seriousness: string;
  ai_reasons: string[];
  positive_signals: string[];
  negative_signals: string[];
  recommendation: string;
  analyst_notes: string;
  ai_raw_response: Record<string, unknown>;
}

/** Map AI output to `buyers` table columns only — extra fields belong in `ai_raw_response` jsonb. */
export function buyerRowPayloadFromAi(ai: AiStructuredResult) {
  return {
    ai_trust_score: ai.ai_trust_score,
    ai_risk_level: ai.ai_risk_level,
    ai_hesitation_detected: ai.ai_hesitation_detected,
    ai_buyer_seriousness: ai.ai_buyer_seriousness,
    ai_reasons: ai.ai_reasons,
    ai_raw_response: {
      ...ai.ai_raw_response,
      positive_signals: ai.positive_signals,
      negative_signals: ai.negative_signals,
      recommendation: ai.recommendation,
      analyst_notes: ai.analyst_notes
    } as Record<string, unknown>
  };
}

export const SYSTEM_PROMPT = `ReturnSense: Output exactly one JSON object. No markdown code fences. No text before or after the JSON. Apply the user rubric mechanically — identical inputs → identical numeric scores.`;

export function buildAnalysisPrompt(
  messages: ChatMessage[],
  username: string,
  phoneProvided?: string | null,
  addressProvided?: string | null
) {
  const chatTranscript = messages.map((m) => `${m.role}: ${m.text}`).join("\n");
  const phoneLine = phoneProvided?.trim()?.length ? phoneProvided.trim() : "Not provided";
  const addressLine = addressProvided?.trim()?.length ? addressProvided.trim() : "Not provided";
  const messageCount = String(messages.length);
  /** Fixed so identical chats produce identical model output (daily date caused drift). */
  const dateStr = "N/A";

  return RS_ANALYST_V1_TEMPLATE.replace("{CHAT_TRANSCRIPT}", chatTranscript)
    .replace("{USERNAME}", username)
    .replace("{PHONE_PROVIDED}", phoneLine)
    .replace("{ADDRESS_PROVIDED}", addressLine)
    .replace("{MESSAGE_COUNT}", messageCount)
    .replace("{DATE}", dateStr);
}

export async function analyzeWithOpenRouter(
  messages: ChatMessage[],
  username: string,
  phoneProvided?: string | null,
  addressProvided?: string | null
): Promise<AiStructuredResult> {
  const prompt = buildAnalysisPrompt(messages, username, phoneProvided, addressProvided);
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "deepseek/deepseek-chat",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      temperature: 0,
      top_p: 1,
      max_tokens: 2048,
      seed: 13371337
    })
  });
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text || typeof text !== "string") {
    throw new Error(data?.error?.message || "OpenRouter returned no content");
  }
  const cleaned = text.replace(/```json|```/g, "").trim();
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(cleaned) as Record<string, unknown>;
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("OpenRouter response was not valid JSON");
    }
    parsed = JSON.parse(cleaned.slice(start, end + 1)) as Record<string, unknown>;
  }
  const reasons = Array.isArray(parsed.ai_reasons)
    ? (parsed.ai_reasons as string[])
    : Array.isArray(parsed.reasons)
      ? (parsed.reasons as string[])
      : [];
  return {
    ai_trust_score: Math.round(Number(parsed.trust_score ?? 50)),
    ai_risk_level: String(parsed.risk_level ?? "medium"),
    ai_hesitation_detected: Boolean(parsed.hesitation_detected),
    ai_buyer_seriousness: String(parsed.buyer_seriousness ?? "medium"),
    ai_reasons: reasons,
    positive_signals: Array.isArray(parsed.positive_signals) ? (parsed.positive_signals as string[]) : [],
    negative_signals: Array.isArray(parsed.negative_signals) ? (parsed.negative_signals as string[]) : [],
    recommendation: String(parsed.recommendation ?? "caution"),
    analyst_notes: String(parsed.analyst_notes ?? ""),
    ai_raw_response: parsed
  };
}
