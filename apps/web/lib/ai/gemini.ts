import type { GenerateContentResult } from "@google/generative-ai";
import { GoogleGenerativeAI } from "@google/generative-ai";

import {
  analyzeWithOpenRouter,
  buildAnalysisPrompt,
  ChatMessage,
  type AiStructuredResult,
  SYSTEM_PROMPT
} from "@/lib/ai/openrouter";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

/** Default suited for new Google AI Studio projects (2.0-flash deprecated for new users). Override with GEMINI_MODEL. */
const GEMINI_MODEL_ID = process.env.GEMINI_MODEL?.trim() || "gemini-2.5-flash";

/** Avoid responseMimeType JSON mode — some Gemini builds throw "Cannot coerce the result to a single JSON object". */
export function getGeminiModel() {
  return genAI.getGenerativeModel({
    model: GEMINI_MODEL_ID,
    generationConfig: {
      temperature: 0,
      topP: 1,
      topK: 1,
      maxOutputTokens: 2048
    }
  });
}

export { SYSTEM_PROMPT, buildAnalysisPrompt };

/**
 * Never call `response.text()` — the JS SDK throws
 * "Cannot coerce the result to a single JSON object" when it cannot merge parts,
 * even though `candidates[].content.parts[].text` has the model output.
 */
function extractTextFromParts(parts: unknown[] | undefined): string {
  if (!parts?.length) return "";
  return parts
    .map((p) => {
      if (p && typeof p === "object" && "text" in p && typeof (p as { text?: unknown }).text === "string") {
        return (p as { text: string }).text;
      }
      return "";
    })
    .join("");
}

function getGeminiResponseText(result: GenerateContentResult): string {
  const chunks: string[] = [];
  for (const c of result.response.candidates ?? []) {
    const raw = extractTextFromParts(c?.content?.parts as unknown[] | undefined);
    if (raw.trim()) chunks.push(raw);
  }
  return chunks.join("\n");
}

function parseAnalysisJson(raw: string): Record<string, unknown> {
  const stripped = raw.replace(/```json\s*/gi, "").replace(/```/g, "").trim();
  try {
    return JSON.parse(stripped) as Record<string, unknown>;
  } catch {
    const start = stripped.indexOf("{");
    const end = stripped.lastIndexOf("}");
    if (start === -1 || end === -1 || end <= start) {
      throw new Error("Gemini returned no parseable JSON object");
    }
    return JSON.parse(stripped.slice(start, end + 1)) as Record<string, unknown>;
  }
}

function mapParsedToAiResult(parsed: Record<string, unknown>): AiStructuredResult {
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

/** Walk Error.cause and stringify nested API errors so we match SDK failures reliably. */
function collectErrorText(err: unknown, depth = 0): string {
  if (err == null || depth > 6) return "";
  if (typeof err === "string") return err;
  if (err instanceof Error) {
    const cause = (err as Error & { cause?: unknown }).cause;
    return err.message + (cause ? ` ${collectErrorText(cause, depth + 1)}` : "");
  }
  if (typeof err === "object") {
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

function isGeminiCoerceOrPartsError(err: unknown) {
  const blob = collectErrorText(err).toLowerCase();
  return blob.includes("coerce") || blob.includes("cannot merge") || blob.includes("single json");
}

/** Retired / wrong model name / API version — fall back without treating as hard failure. */
function isGeminiModelUnavailableError(err: unknown) {
  const blob = collectErrorText(err).toLowerCase();
  return (
    blob.includes("not found") ||
    blob.includes("404") ||
    blob.includes("is not supported") ||
    blob.includes("not supported for generatecontent") ||
    blob.includes("listmodels") ||
    blob.includes("no longer available")
  );
}

export async function analyzeWithGemini(
  messages: ChatMessage[],
  username: string,
  phoneProvided?: string | null,
  addressProvided?: string | null
): Promise<AiStructuredResult> {
  if (!process.env.GEMINI_API_KEY?.trim()) {
    return analyzeWithOpenRouter(messages, username, phoneProvided, addressProvided);
  }

  const model = getGeminiModel();
  const prompt = buildAnalysisPrompt(messages, username, phoneProvided, addressProvided);

  try {
    let result: GenerateContentResult;
    try {
      result = await model.generateContent({
        systemInstruction: SYSTEM_PROMPT,
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      });
    } catch (genErr) {
      if (isGeminiCoerceOrPartsError(genErr) || isGeminiModelUnavailableError(genErr)) {
        console.warn(
          "[RS] Gemini generateContent unavailable — using OpenRouter fallback:",
          collectErrorText(genErr).slice(0, 280)
        );
        return await analyzeWithOpenRouter(messages, username, phoneProvided, addressProvided);
      }
      throw genErr;
    }

    const rawText = getGeminiResponseText(result);
    if (!rawText?.trim()) {
      return await analyzeWithOpenRouter(messages, username, phoneProvided, addressProvided);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = parseAnalysisJson(rawText);
    } catch {
      return await analyzeWithOpenRouter(messages, username, phoneProvided, addressProvided);
    }
    return mapParsedToAiResult(parsed);
  } catch (err) {
    console.error("Gemini error:", err);
    return await analyzeWithOpenRouter(messages, username, phoneProvided, addressProvided);
  }
}
