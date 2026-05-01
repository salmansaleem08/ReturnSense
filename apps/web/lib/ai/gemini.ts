import { GoogleGenerativeAI } from "@google/generative-ai";

import { analyzeWithOpenRouter, buildAnalysisPrompt, ChatMessage, SYSTEM_PROMPT } from "@/lib/ai/openrouter";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY ?? "");

export function getGeminiModel() {
  return genAI.getGenerativeModel({
    model: "gemini-2.5-flash-preview-05-20",
    generationConfig: {
      temperature: 0.1,
      topP: 0.8,
      maxOutputTokens: 1024,
      responseMimeType: "application/json"
    }
  });
}

export { SYSTEM_PROMPT, buildAnalysisPrompt };

export async function analyzeWithGemini(messages: ChatMessage[], username: string) {
  const model = getGeminiModel();
  const prompt = buildAnalysisPrompt(messages, username);

  try {
    const result = await model.generateContent({
      systemInstruction: SYSTEM_PROMPT,
      contents: [{ role: "user", parts: [{ text: prompt }] }]
    });

    const rawText = result.response.text();
    const cleaned = rawText.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);

    return {
      ai_trust_score: parsed.trust_score,
      ai_risk_level: parsed.risk_level,
      ai_hesitation_detected: parsed.hesitation_detected,
      ai_buyer_seriousness: parsed.buyer_seriousness,
      ai_reasons: parsed.reasons,
      positive_signals: parsed.positive_signals,
      negative_signals: parsed.negative_signals,
      recommendation: parsed.recommendation,
      analyst_notes: parsed.analyst_notes,
      ai_raw_response: parsed
    };
  } catch (err) {
    console.error("Gemini error:", err);
    return await analyzeWithOpenRouter(messages, username);
  }
}
