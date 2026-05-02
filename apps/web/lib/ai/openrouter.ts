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

const ANALYSIS_PROMPT_TEMPLATE = `You are an expert e-commerce fraud analyst specializing in Pakistani Instagram COD (Cash on Delivery) order risk assessment. You have analyzed thousands of conversations between sellers and potential buyers.

Analyze the following Instagram DM conversation between a seller and a buyer. Your job is to assess the buyer's legitimacy and predict whether this order will be successfully delivered or will result in a return, cancellation, or fake order.

CONVERSATION:
{CHAT_TRANSCRIPT}

BUYER INFORMATION:
- Username: {USERNAME}
- Phone: {PHONE_PROVIDED}
- Address: {ADDRESS_PROVIDED}

---

ANALYSIS FRAMEWORK — evaluate each dimension carefully:

1. COMMITMENT SIGNALS
   - Did the buyer explicitly confirm the order? (words like "confirm", "haan", "ha", "ok", "theek hai", "done", "zaroor", "bilkul", "pakka")
   - Did they ask about delivery timeline, price confirmation, or payment method?
   - Did they proactively share their phone or address without being asked?
   - Did they express urgency to receive the product?

2. HESITATION & AVOIDANCE SIGNALS
   - Did they ask for a discount or price reduction multiple times?
   - Did they say they need to "ask someone else" or "think about it" then suddenly confirm?
   - Did they ask if they can return it easily?
   - Did they go silent for long periods then resume?
   - Did they ask to pay partial COD or "thoda baad mein"?

3. COMMUNICATION QUALITY
   - Is their language consistent and coherent?
   - Do their messages make sense as a genuine buyer?
   - Did they ask specific product questions (size, color, quantity, material)?
   - Is their address detailed and specific (house number, street, city)?
   - Is their phone number Pakistani format (03XX)?

4. RED FLAGS SPECIFIC TO PAKISTANI COD
   - Vague or incomplete address (only city name, no street/house)
   - Using a VoIP number (WhatsApp-only number with no carrier)
   - Excessive bargaining followed by sudden confirmation
   - Asking about return policy before ordering
   - No specific product questions (suggests disengaged or fake buyer)
   - Asking "cash dena hoga?" multiple times
   - Address in a high-risk area for returns (this is context-dependent)

5. POSITIVE INDICATORS
   - Clear and specific product questions asked
   - Proactive phone/address sharing
   - Explicit confirmation with specific product details mentioned
   - Polite and businesslike tone throughout
   - Single confirmation without going back and forth

---

Respond ONLY with a valid JSON object. No markdown, no explanation, no text outside the JSON.

{
  "trust_score": <integer 0-100, where 100 = definitely legitimate, 0 = definitely fake>,
  "risk_level": "<low|medium|high|critical>",
  "analyst_notes": "<2-3 sentence human-readable summary written like a professional fraud analyst. Be specific — mention actual things said in the chat, not generic statements. Example: 'Buyer confirmed the pink hoodie in size M and proactively shared their Lahore address. No hesitation detected. Communication was direct and transaction-focused.'>",
  "recommendation": "<proceed|caution|hold|reject>",
  "commitment_confirmed": <true|false>,
  "buyer_seriousness": "<high|medium|low>",
  "communication_quality": "<excellent|good|average|poor>",
  "ai_reasons": [
    "<specific reason 1 — cite actual words or behavior from the chat, not generic>",
    "<specific reason 2>",
    "<specific reason 3 — minimum 3, maximum 6 reasons>"
  ],
  "positive_signals": [
    "<specific positive signal observed in this conversation>"
  ],
  "negative_signals": [
    "<specific negative signal or red flag observed — if none, return empty array>"
  ],
  "hesitation_detected": <true|false>,
  "asked_about_returns": <true|false>,
  "shared_phone_proactively": <true|false>,
  "shared_address_proactively": <true|false>,
  "excessive_bargaining": <true|false>,
  "conversation_summary": "<one sentence factual summary of what was discussed>"
}

SCORING GUIDE:
- 85-100: Buyer is clearly genuine, confirmed order, specific details, no red flags → proceed
- 65-84: Mostly positive signals, minor uncertainty → proceed with normal caution  
- 45-64: Mixed signals, some hesitation or vague details → caution, consider calling to verify
- 25-44: Multiple red flags, inconsistent behavior → hold, do not ship without phone verification
- 0-24: Strong fraud indicators, classic fake-order pattern → reject

CRITICAL: Your reasons must reference SPECIFIC things from THIS conversation. Do NOT write generic reasons like "Buyer confirmed the order" without quoting or referencing what they actually said. If the conversation is very short (fewer than 3 messages), note that explicitly and lower the score accordingly since insufficient data is itself a risk signal.`;

export function buildAnalysisPrompt(
  messages: ChatMessage[],
  username: string,
  phoneProvided?: string | null,
  addressProvided?: string | null
) {
  const chatTranscript = messages.map((m) => `${m.role}: ${m.text}`).join("\n");
  const phoneLine = phoneProvided?.trim()?.length ? phoneProvided.trim() : "Not provided";
  const addressLine = addressProvided?.trim()?.length ? addressProvided.trim() : "Not provided";

  return ANALYSIS_PROMPT_TEMPLATE.replace("{CHAT_TRANSCRIPT}", chatTranscript)
    .replace("{USERNAME}", username)
    .replace("{PHONE_PROVIDED}", phoneLine)
    .replace("{ADDRESS_PROVIDED}", addressLine);
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
  const reasons = Array.isArray(parsed.ai_reasons)
    ? (parsed.ai_reasons as string[])
    : Array.isArray(parsed.reasons)
      ? (parsed.reasons as string[])
      : [];
  return {
    ai_trust_score: Number(parsed.trust_score ?? 50),
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
