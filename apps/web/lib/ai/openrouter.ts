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

export const SYSTEM_PROMPT = `
You are a behavioral risk analyst for an e-commerce buyer verification system.
Your job is to analyze Instagram buyer conversations and identify psychological
and behavioral signals that indicate risk of non-delivery, order cancellation,
COD refusal, or fraudulent intent.

You MUST respond with ONLY a valid JSON object. No markdown. No explanation.
No preamble. Just the JSON object.

Analyze the conversation for these behavioral signals:
- Commitment level: Does buyer confirm clearly and directly?
- Hesitation patterns: Repeated uncertainty, changing mind, vague answers
- Address/contact evasion: Avoiding sharing complete delivery info
- Urgency inconsistency: Artificial urgency then sudden silence
- Bargaining aggression: Excessive or manipulative price negotiation
- Communication consistency: Do answers match questions logically?
- Engagement quality: Short dismissive replies vs detailed genuine interest
- Commitment anchors: Did buyer explicitly confirm order, date, method?
`;

export function buildAnalysisPrompt(messages: ChatMessage[], username: string) {
  const chatText = messages.map((m) => `[${m.role.toUpperCase()}]: ${m.text}`).join("\n");

  return `
Analyze this Instagram buyer conversation for buyer @${username}.

CONVERSATION:
---
${chatText}
---

Return ONLY this JSON structure:
{
  "trust_score": <integer 0-100>,
  "risk_level": "<low|medium|high|critical>",
  "buyer_seriousness": "<low|moderate|high>",
  "hesitation_detected": <true|false>,
  "commitment_confirmed": <true|false>,
  "address_evasion": <true|false>,
  "bargaining_aggression": "<none|mild|aggressive>",
  "communication_quality": "<poor|average|good>",
  "positive_signals": ["<signal>", ...],
  "negative_signals": ["<signal>", ...],
  "reasons": ["<reason string>", ...],
  "recommendation": "<proceed|caution|hold|reject>",
  "analyst_notes": "<1-2 sentences of key observation>"
}
  `;
}

export async function analyzeWithOpenRouter(messages: ChatMessage[], username: string): Promise<AiStructuredResult> {
  const prompt = buildAnalysisPrompt(messages, username);
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
      temperature: 0.1,
      max_tokens: 1024
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
  return {
    ai_trust_score: Number(parsed.trust_score ?? 50),
    ai_risk_level: String(parsed.risk_level ?? "medium"),
    ai_hesitation_detected: Boolean(parsed.hesitation_detected),
    ai_buyer_seriousness: String(parsed.buyer_seriousness ?? "moderate"),
    ai_reasons: Array.isArray(parsed.reasons) ? (parsed.reasons as string[]) : [],
    positive_signals: Array.isArray(parsed.positive_signals) ? (parsed.positive_signals as string[]) : [],
    negative_signals: Array.isArray(parsed.negative_signals) ? (parsed.negative_signals as string[]) : [],
    recommendation: String(parsed.recommendation ?? "caution"),
    analyst_notes: String(parsed.analyst_notes ?? ""),
    ai_raw_response: parsed
  };
}
