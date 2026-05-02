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

/**
 * Abstract Phone Intelligence (current) vs legacy Phone Validation — different hosts and keys.
 * @see https://www.abstractapi.com/api/phone-intelligence
 */
function getAbstractPhoneApiBase(): string {
  const raw = process.env.ABSTRACT_PHONE_API_URL?.trim();
  if (raw) return raw.replace(/\/+$/, "");
  return "https://phoneintelligence.abstractapi.com/v1";
}

/** Phone Intelligence response shape (distinct from legacy Phone Validation flat JSON). */
function isPhoneIntelligencePayload(data: Record<string, unknown>): boolean {
  return (
    data.phone_validation != null ||
    data.phone_carrier != null ||
    data.phone_format != null ||
    data.phone_location != null
  );
}

/** Map https://docs.abstractapi.com/api/phone-intelligence response → our fields. */
function mapPhoneIntelligencePayload(data: Record<string, unknown>): {
  phone_valid: boolean | null;
  phone_carrier: string | null;
  phone_is_voip: boolean | null;
  phone_type: string | null;
  phone_country: string | null;
  phone_international_format: string | null;
  phone_local_format: string | null;
} {
  const pv = data.phone_validation as Record<string, unknown> | undefined;
  const pc = data.phone_carrier as Record<string, unknown> | undefined;
  const pl = data.phone_location as Record<string, unknown> | undefined;
  const pf = data.phone_format as Record<string, unknown> | undefined;

  const phone_valid = typeof pv?.is_valid === "boolean" ? pv.is_valid : null;

  let phone_is_voip: boolean | null = typeof pv?.is_voip === "boolean" ? pv.is_voip : null;

  const lineFromCarrier = typeof pc?.line_type === "string" ? pc.line_type : null;
  const lt = (lineFromCarrier || "").toLowerCase();
  if (lt.includes("voip")) {
    phone_is_voip = true;
  }

  const phone_carrier = typeof pc?.name === "string" ? pc.name : null;
  const phone_country = typeof pl?.country_name === "string" ? pl.country_name : null;
  const phone_international_format =
    typeof pf?.international === "string" ? pf.international : null;
  const phone_local_format = typeof pf?.national === "string" ? pf.national : null;

  return {
    phone_valid,
    phone_carrier,
    phone_is_voip,
    phone_type: lineFromCarrier,
    phone_country,
    phone_international_format,
    phone_local_format
  };
}

/** Legacy Phone Validation: optional nested `phone` object with flat fields. */
function abstractPayloadRoot(data: Record<string, unknown>): Record<string, unknown> {
  const nested = data.phone;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return { ...data, ...(nested as Record<string, unknown>) };
  }
  return data;
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
    const base = getAbstractPhoneApiBase();
    const url = `${base}/?api_key=${encodeURIComponent(apiKey)}&phone=${encodeURIComponent(cleanPhone)}`;
    console.log("[RS-PHONE] Using Abstract phone API base:", base);
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: abortAfter(8000)
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "unknown");
      console.error("[RS] Abstract API error:", response.status, errorText);

      let detail = `Phone API returned HTTP ${response.status}`;
      if (response.status === 401) {
        detail =
          "Abstract API rejected this key (401). Keys are product-specific: use the key from the same product as your URL (Phone Intelligence: phoneintelligence.abstractapi.com). Set ABSTRACT_PHONE_API_URL if you use legacy Phone Validation. Regenerate at https://app.abstractapi.com/";
      } else if (response.status === 403 || response.status === 429) {
        detail = `Phone API rate limit or plan issue (${response.status}). Check Abstract dashboard billing and quotas.`;
      }

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
        error: detail
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

    if (isPhoneIntelligencePayload(data)) {
      const mapped = mapPhoneIntelligencePayload(data);
      console.log("[RS-PHONE] Parsed Phone Intelligence payload (carrier present:", Boolean(mapped.phone_carrier), ")");
      return {
        ...mapped,
        phone_number: cleanPhone,
        configured: true,
        not_provided: false,
        error: null
      };
    }

    const src = abstractPayloadRoot(data);

    const fmt = src.format as Record<string, unknown> | undefined;
    const country = src.country as Record<string, unknown> | string | undefined;
    const countryName =
      typeof country === "object" && country !== null && "name" in country
        ? (country.name as string | null)
        : typeof country === "string"
          ? country
          : null;

    const lineType =
      (typeof src.line_type === "string" ? src.line_type : null) ??
      (typeof src.type === "string" ? src.type : null);

    const ltLower = lineType?.toLowerCase() ?? "";
    const isVoip =
      ltLower.includes("voip") ||
      ltLower === "voip" ||
      lineType === "VoIP";

    const intl =
      (fmt?.international as string | undefined) ??
      (typeof src.international_format === "string" ? src.international_format : null);
    const local =
      (fmt?.local as string | undefined) ??
      (typeof src.local_format === "string" ? src.local_format : null);

    return {
      phone_valid: typeof src.valid === "boolean" ? src.valid : null,
      phone_carrier: typeof src.carrier === "string" ? src.carrier : null,
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
