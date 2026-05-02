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

/** Avoid responseMimeType JSON mode — some Gemini builds throw "Cannot coerce the result to a single JSON object". */
export function getGeminiModel() {
  return genAI.getGenerativeModel({
    model: "gemini-2.5-flash-preview-05-20",
    generationConfig: {
      temperature: 0.1,
      topP: 0.8,
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

export async function analyzeWithGemini(messages: ChatMessage[], username: string): Promise<AiStructuredResult> {
  if (!process.env.GEMINI_API_KEY?.trim()) {
    return analyzeWithOpenRouter(messages, username);
  }

  const model = getGeminiModel();
  const prompt = buildAnalysisPrompt(messages, username);

  try {
    let result: GenerateContentResult;
    try {
      result = await model.generateContent({
        systemInstruction: SYSTEM_PROMPT,
        contents: [{ role: "user", parts: [{ text: prompt }] }]
      });
    } catch (genErr) {
      if (isGeminiCoerceOrPartsError(genErr)) {
        console.warn("Gemini generateContent failed (coerce/parts) — using OpenRouter fallback");
        return await analyzeWithOpenRouter(messages, username);
      }
      throw genErr;
    }

    const rawText = getGeminiResponseText(result);
    if (!rawText?.trim()) {
      return await analyzeWithOpenRouter(messages, username);
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = parseAnalysisJson(rawText);
    } catch {
      return await analyzeWithOpenRouter(messages, username);
    }
    return mapParsedToAiResult(parsed);
  } catch (err) {
    console.error("Gemini error:", err);
    return await analyzeWithOpenRouter(messages, username);
  }
}
