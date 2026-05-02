export interface PhoneValidationResult {
  phone_valid: boolean | null;
  phone_carrier: string | null;
  phone_is_voip: boolean | null;
  phone_type: string | null;
  phone_country: string | null;
  phone_international_format: string | null;
  phone_local_format: string | null;
  phone_number: string | null;
  configured: boolean;
  not_provided: boolean;
  error: string | null;
}

/** @deprecated use PhoneValidationResult — kept for existing imports */
export type PhoneResult = PhoneValidationResult;

function getAbstractApiKey(): string | null {
  const raw =
    process.env.ABSTRACT_API_KEY ??
    process.env.ABSTRACTAPI_KEY ??
    process.env.ABSTRACT_PHONE_API_KEY ??
    process.env.ABSTRACT_KEY ??
    "";
  const trimmed = typeof raw === "string" ? raw.trim() : "";
  return trimmed.length ? trimmed : null;
}

function abortAfter(ms: number): AbortSignal | undefined {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(ms);
  }
  return undefined;
}

export async function validatePhone(phoneInput?: string | null): Promise<PhoneValidationResult> {
  const apiKey = getAbstractApiKey();

  const cleanPhone = phoneInput?.replace(/[\s\-.]/g, "") ?? "";

  if (!apiKey) {
    console.warn(
      "[RS-PHONE] ABSTRACT_API_KEY not set — set ABSTRACT_API_KEY (or ABSTRACT_PHONE_API_KEY) on the server. Phone carrier/valid checks disabled."
    );
    return {
      phone_valid: null,
      phone_carrier: null,
      phone_is_voip: null,
      phone_type: null,
      phone_country: null,
      phone_international_format: null,
      phone_local_format: null,
      phone_number: cleanPhone || null,
      configured: false,
      not_provided: false,
      error: "ABSTRACT_API_KEY environment variable is not set on the server"
    };
  }

  if (!cleanPhone) {
    return {
      phone_valid: null,
      phone_carrier: null,
      phone_is_voip: null,
      phone_type: null,
      phone_country: null,
      phone_international_format: null,
      phone_local_format: null,
      phone_number: null,
      configured: true,
      not_provided: true,
      error: null
    };
  }

  try {
    const url = `https://phonevalidation.abstractapi.com/v1/?api_key=${encodeURIComponent(apiKey)}&phone=${encodeURIComponent(cleanPhone)}`;
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: abortAfter(8000)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown");
      console.error("[RS] Abstract API error:", response.status, errorText);
      return {
        phone_valid: null,
        phone_carrier: null,
        phone_is_voip: null,
        phone_type: null,
        phone_country: null,
        phone_international_format: null,
        phone_local_format: null,
        phone_number: cleanPhone,
        configured: true,
        not_provided: false,
        error: `Phone API returned HTTP ${response.status}`
      };
    }

    const data = (await response.json()) as Record<string, unknown>;

    if (data?.error) {
      console.error("[RS] Abstract API payload error:", data.error);
      return {
        phone_valid: null,
        phone_carrier: null,
        phone_is_voip: null,
        phone_type: null,
        phone_country: null,
        phone_international_format: null,
        phone_local_format: null,
        phone_number: cleanPhone,
        configured: true,
        not_provided: false,
        error: String(data.error)
      };
    }

    const fmt = data.format as Record<string, unknown> | undefined;
    const country = data.country as Record<string, unknown> | string | undefined;
    const countryName =
      typeof country === "object" && country !== null && "name" in country
        ? (country.name as string | null)
        : typeof country === "string"
          ? country
          : null;

    const lineType =
      (typeof data.line_type === "string" ? data.line_type : null) ??
      (typeof data.type === "string" ? data.type : null);

    const ltLower = lineType?.toLowerCase() ?? "";
    const isVoip =
      ltLower.includes("voip") ||
      ltLower === "voip" ||
      lineType === "VoIP";

    const intl =
      (fmt?.international as string | undefined) ??
      (typeof data.international_format === "string" ? data.international_format : null);
    const local =
      (fmt?.local as string | undefined) ??
      (typeof data.local_format === "string" ? data.local_format : null);

    return {
      phone_valid: typeof data.valid === "boolean" ? data.valid : null,
      phone_carrier: typeof data.carrier === "string" ? data.carrier : null,
      phone_is_voip: isVoip,
      phone_type: lineType,
      phone_country: countryName,
      phone_international_format: intl,
      phone_local_format: local,
      phone_number: cleanPhone,
      configured: true,
      not_provided: false,
      error: null
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[RS] validatePhone threw:", message);
    return {
      phone_valid: null,
      phone_carrier: null,
      phone_is_voip: null,
      phone_type: null,
      phone_country: null,
      phone_international_format: null,
      phone_local_format: null,
      phone_number: cleanPhone,
      configured: true,
      not_provided: false,
      error: `Phone validation failed: ${message}`
    };
  }
}

export function getPhoneRiskScore(phoneResult?: PhoneValidationResult | null) {
  if (!phoneResult || phoneResult.configured !== true) {
    return { score: 0, signals: [] as Array<{ name: string; impact: number; description: string }> };
  }

  if (phoneResult.phone_valid === null) {
    return {
      score: 50,
      signals: [] as Array<{ name: string; impact: number; description: string }>
    };
  }

  let riskPoints = 0;
  const signals: Array<{ name: string; impact: number; description: string }> = [];

  if (!phoneResult.phone_valid) {
    riskPoints += 30;
    signals.push({ name: "invalid_phone", impact: -30, description: "Phone number is invalid or not in service" });
  }
  if (phoneResult.phone_is_voip) {
    riskPoints += 25;
    signals.push({ name: "voip_number", impact: -25, description: "VoIP number detected — often used for fake orders" });
  }
  if (phoneResult.phone_type?.toLowerCase() === "landline") {
    riskPoints += 10;
    signals.push({ name: "landline_number", impact: -10, description: "Landline number given for delivery — unusual" });
  }
  if (phoneResult.phone_valid && !phoneResult.phone_is_voip) {
    riskPoints -= 10;
    signals.push({ name: "valid_mobile", impact: 10, description: "Valid mobile number verified" });
  }
  return { score: riskPoints, signals };
}
