export interface PhoneResult {
  phone_valid: boolean;
  phone_carrier?: string | null;
  phone_is_voip?: boolean;
  phone_country?: string | null;
  phone_type?: string | null;
  phone_local_format?: string | null;
  phone_international_format?: string | null;
  phone_error?: string;
}

export async function validatePhone(phoneNumber?: string | null): Promise<PhoneResult | null> {
  const trimmed = phoneNumber?.trim();
  if (!trimmed) return null;

  const apiKey = process.env.ABSTRACT_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const cleaned = trimmed.replace(/[^0-9+]/g, "");
  if (cleaned.replace(/\D/g, "").length < 7) {
    return null;
  }

  let data: Record<string, unknown>;
  try {
    const res = await fetch(
      `https://phonevalidation.abstractapi.com/v1/?api_key=${apiKey}&phone=${encodeURIComponent(cleaned)}`
    );
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    return null;
  }

  if (!data || data.error) {
    return null;
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
    phone_international_format: row.international_format ?? null
  };
}

export function getPhoneRiskScore(phoneResult?: PhoneResult | null) {
  if (!phoneResult) return { score: 0, signals: [] as Array<{ name: string; impact: number; description: string }> };
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
