export interface PhoneResult {
  phone_valid: boolean | null;
  phone_carrier?: string | null;
  phone_is_voip?: boolean | null;
  phone_country?: string | null;
  phone_type?: string | null;
  phone_local_format?: string | null;
  phone_international_format?: string | null;
  phone_number?: string | null;
  phone_error?: string;
  configured: boolean;
  error?: string | null;
  not_provided?: boolean;
}

const PHONE_FAIL: PhoneResult = {
  phone_valid: null,
  phone_carrier: null,
  phone_is_voip: null,
  phone_type: null,
  phone_country: null,
  phone_international_format: null,
  phone_local_format: null,
  configured: true,
  error: "Phone validation request failed"
};

export async function validatePhone(phoneNumber?: string | null): Promise<PhoneResult | null> {
  if (!process.env.ABSTRACT_API_KEY?.trim()) {
    return {
      phone_valid: null,
      phone_carrier: null,
      phone_is_voip: null,
      phone_type: null,
      phone_country: null,
      phone_international_format: null,
      phone_local_format: null,
      configured: false,
      error: "ABSTRACT_API_KEY is not configured on the server"
    };
  }

  const trimmed = phoneNumber?.trim();
  if (!trimmed) return null;

  const cleaned = trimmed.replace(/[^0-9+]/g, "");
  if (cleaned.replace(/\D/g, "").length < 7) {
    return null;
  }

  let res: Response;
  try {
    res = await fetch(
      `https://phonevalidation.abstractapi.com/v1/?api_key=${process.env.ABSTRACT_API_KEY.trim()}&phone=${encodeURIComponent(cleaned)}`
    );
  } catch {
    return { ...PHONE_FAIL };
  }

  if (!res.ok) {
    return { ...PHONE_FAIL };
  }

  let data: Record<string, unknown>;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    return { ...PHONE_FAIL };
  }

  if (!data || data.error) {
    return { ...PHONE_FAIL };
  }

  const row = data as {
    valid?: boolean;
    carrier?: string | null;
    type?: string | null;
    country?: { name?: string | null };
    local_format?: string | null;
    international_format?: string | null;
  };

  return {
    phone_valid: Boolean(row.valid),
    phone_carrier: row.carrier ?? null,
    phone_is_voip: row.type === "VoIP",
    phone_country: row.country?.name ?? null,
    phone_type: row.type ?? null,
    phone_local_format: row.local_format ?? null,
    phone_international_format: row.international_format ?? null,
    configured: true
  };
}

export function getPhoneRiskScore(phoneResult?: PhoneResult | null) {
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
  if (phoneResult.phone_type === "landline") {
    riskPoints += 10;
    signals.push({ name: "landline_number", impact: -10, description: "Landline number given for delivery — unusual" });
  }
  if (phoneResult.phone_valid && !phoneResult.phone_is_voip) {
    riskPoints -= 10;
    signals.push({ name: "valid_mobile", impact: 10, description: "Valid mobile number verified" });
  }
  return { score: riskPoints, signals };
}
