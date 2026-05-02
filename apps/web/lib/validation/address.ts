export interface AddressResult {
  address_formatted: string | null;
  address_lat: number | null;
  address_lng: number | null;
  address_city: string | null;
  address_province?: string | null;
  address_country: string | null;
  address_postal_code?: string | null;
  address_quality_score: number;
  address_found: boolean;
  address_types?: string[];
  address_precision?: string;
}

interface GeocodeResult {
  types: string[];
  geometry: { location_type: string; location: { lat: number; lng: number } };
  formatted_address: string;
  address_components: Array<{ types: string[]; long_name: string; short_name: string }>;
}

export async function validateAddress(rawAddress?: string | null): Promise<AddressResult | null> {
  const trimmed = rawAddress?.trim();
  if (!trimmed) return null;

  const mapsKey = process.env.GOOGLE_MAPS_API_KEY?.trim();
  if (!mapsKey) {
    return null;
  }

  const encoded = encodeURIComponent(trimmed);
  let data: { status?: string; results?: unknown[] };
  try {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encoded}&key=${mapsKey}`
    );
    data = await res.json();
  } catch {
    return null;
  }

  if (data.status !== "OK" || !data.results?.length) {
    return {
      address_formatted: null,
      address_lat: null,
      address_lng: null,
      address_city: null,
      address_country: null,
      address_quality_score: 0,
      address_found: false
    };
  }

  const result = data.results[0] as GeocodeResult;
  const components = result.address_components;

  const getComponent = (type: string) =>
    components.find((c: { types: string[]; long_name: string }) => c.types.includes(type))?.long_name || null;

  const qualityScore = computeAddressQuality(trimmed, result);

  return {
    address_formatted: result.formatted_address,
    address_lat: result.geometry.location.lat,
    address_lng: result.geometry.location.lng,
    address_city: getComponent("locality") || getComponent("administrative_area_level_2"),
    address_province: getComponent("administrative_area_level_1"),
    address_country: getComponent("country"),
    address_postal_code: getComponent("postal_code"),
    address_quality_score: qualityScore,
    address_found: true,
    address_types: result.types,
    address_precision: result.geometry.location_type
  };
}

export function computeAddressQuality(rawAddress: string, geocodeResult: GeocodeResult) {
  let score = 100;

  if (geocodeResult.types.includes("locality")) {
    score -= 40;
  }

  if (geocodeResult.geometry.location_type === "APPROXIMATE") {
    score -= 25;
  }

  if (rawAddress.trim().split(" ").length < 4) {
    score -= 20;
  }

  const hasHouseNumber = /\b\d+[A-Za-z]?\b/.test(rawAddress);
  if (!hasHouseNumber) {
    score -= 15;
  }

  if (geocodeResult.geometry.location_type === "ROOFTOP") {
    score += 10;
  }

  return Math.max(0, Math.min(100, score));
}

export function getAddressRiskScore(addressResult?: AddressResult | null) {
  /** No address submitted — do not penalize the score. */
  if (!addressResult) {
    return { score: 0, signals: [] };
  }

  /** Address was submitted but geocoding failed or returned nothing. */
  if (!addressResult.address_found) {
    return {
      score: 35,
      signals: [{ name: "address_not_found", impact: -35, description: "Address could not be located on map" }]
    };
  }

  const signals: Array<{ name: string; impact: number; description: string }> = [];
  let riskPoints = 0;

  if (addressResult.address_quality_score < 30) {
    riskPoints += 30;
    signals.push({ name: "very_poor_address", impact: -30, description: "Address is too vague or incomplete" });
  } else if (addressResult.address_quality_score < 60) {
    riskPoints += 15;
    signals.push({ name: "poor_address", impact: -15, description: "Address lacks specific details" });
  } else {
    riskPoints -= 10;
    signals.push({ name: "good_address", impact: 10, description: "Specific and verifiable address provided" });
  }

  return { score: riskPoints, signals };
}
