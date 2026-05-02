/**
 * Normalize user-entered numbers to E.164-friendly strings for carrier intelligence APIs.
 * Pakistan mobiles are often entered as 03XX… — Abstract typically resolves better with +92….
 */

export type PhoneNormalizeResult = {
  /** Preferred value for the lookup API (usually E.164 with leading +). */
  e164: string;
  /** Alternate candidates if the primary lookup returns weak results (same country family). */
  fallbacks: string[];
  /** Short note for logs/UI (not PII). */
  hint: string | null;
};

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

/**
 * Heuristic country detection from common South Asian + North America patterns.
 * Unknown shapes are returned with minimal change so the upstream API can still try.
 */
export function normalizePhoneForLookup(raw: string): PhoneNormalizeResult {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) {
    return { e164: "", fallbacks: [], hint: null };
  }

  if (trimmed.startsWith("+")) {
    const d = digitsOnly(trimmed);
    const e164 = d.length ? `+${d}` : trimmed;
    return { e164, fallbacks: [], hint: null };
  }

  const d = digitsOnly(trimmed);

  // Pakistan mobile: 03XXXXXXXXX (11) or 3XXXXXXXXX (10) or 923XXXXXXXXXX (12)
  if (/^0?3\d{9}$/.test(d) && (d.length === 11 || d.length === 10)) {
    const national10 = d.length === 11 && d.startsWith("0") ? d.slice(1) : d;
    if (/^3\d{9}$/.test(national10)) {
      const e164 = `+92${national10}`;
      return {
        e164,
        fallbacks: [e164.replace("+", ""), `00${e164.slice(1)}`],
        hint: "Pakistan mobile → +92"
      };
    }
  }
  if (d.length === 12 && d.startsWith("92") && d[2] === "3") {
    return {
      e164: `+${d}`,
      fallbacks: [],
      hint: "Pakistan (+92)"
    };
  }

  // India 10-digit mobile
  if (/^[6-9]\d{9}$/.test(d) && d.length === 10) {
    return {
      e164: `+91${d}`,
      fallbacks: [],
      hint: "India mobile → +91"
    };
  }

  // UK 07… → +44 7…
  if (d.length === 11 && d.startsWith("07")) {
    return {
      e164: `+44${d.slice(1)}`,
      fallbacks: [],
      hint: "UK mobile → +44"
    };
  }

  // US/Canada 10-digit NANP (no leading 1)
  if (d.length === 10 && /^[2-9]\d{2}[2-9]\d{6}$/.test(d)) {
    return {
      e164: `+1${d}`,
      fallbacks: [],
      hint: "North America → +1"
    };
  }
  if (d.length === 11 && d.startsWith("1")) {
    return {
      e164: `+${d}`,
      fallbacks: [],
      hint: "North America (+1)"
    };
  }

  // Default: digits only (some APIs accept national format); keep one + fallback if long enough
  if (d.length >= 8 && d.length <= 15) {
    return {
      e164: `+${d}`,
      fallbacks: [d],
      hint: "Generic international (+prefix)"
    };
  }

  return { e164: d || trimmed, fallbacks: [], hint: null };
}
