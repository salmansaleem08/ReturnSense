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
  if (!phoneNumber) return null;
  const cleaned = phoneNumber.replace(/[^0-9+]/g, "");

  const res = await fetch(
    `https://phonevalidation.abstractapi.com/v1/?api_key=${process.env.ABSTRACT_API_KEY}&phone=${cleaned}`
  );
  const data = await res.json();

  if (!data || data.error) {
    return { phone_valid: false, phone_error: "Could not validate" };
  }

  return {
    phone_valid: data.valid,
    phone_carrier: data.carrier,
    phone_is_voip: data.type === "VoIP",
    phone_country: data.country?.name,
    phone_type: data.type,
    phone_local_format: data.local_format,
    phone_international_format: data.international_format
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
