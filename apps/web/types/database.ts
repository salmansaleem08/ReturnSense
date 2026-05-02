export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  plan: "free" | "pro" | "agency";
  analyses_used: number;
  analyses_limit: number;
  created_at: string;
}

export interface Buyer {
  id: string;
  seller_id: string;
  instagram_username: string;
  phone_number: string | null;
  address_raw: string | null;
  address_formatted: string | null;
  address_lat: number | null;
  address_lng: number | null;
  address_city: string | null;
  address_province: string | null;
  address_country: string | null;
  address_quality_score: number | null;
  phone_valid: boolean | null;
  phone_carrier: string | null;
  phone_is_voip: boolean | null;
  phone_country: string | null;
  phone_region: string | null;
  phone_city: string | null;
  ai_trust_score: number | null;
  ai_risk_level: "low" | "medium" | "high" | "critical" | null;
  ai_hesitation_detected: boolean | null;
  ai_buyer_seriousness: "low" | "moderate" | "high" | null;
  ai_reasons: string[] | null;
  ai_raw_response: Record<string, unknown> | null;
  final_trust_score: number | null;
  final_risk_level: "low" | "medium" | "high" | "critical" | null;
  chat_snapshot: string | null;
  outcome: "pending" | "delivered" | "returned" | "fake" | "cancelled";
  outcome_marked_at: string | null;
  outcome_notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface RiskSignal {
  id: string;
  buyer_id: string;
  signal_type: "chat" | "address" | "phone" | "history";
  signal_name: string;
  impact: number;
  description: string | null;
  created_at: string;
}

export interface AnalysisResult {
  buyer_id: string;
  trust_score: number;
  risk_level: "low" | "medium" | "high" | "critical";
  ai_reasons: string[];
  signals: RiskSignal[];
  phone_analysis: PhoneResult | null;
  address_analysis: AddressResult | null;
  dashboard_url: string;
}

export interface PhoneResult {
  phone_valid: boolean | null;
  phone_carrier: string | null;
  phone_is_voip: boolean | null;
  phone_country: string | null;
  phone_region?: string | null;
  phone_city?: string | null;
  phone_type?: string | null;
  phone_local_format?: string | null;
  phone_international_format?: string | null;
  phone_lookup_query?: string | null;
  configured?: boolean;
  error?: string;
}

export interface AddressResult {
  address_formatted: string | null;
  address_lat: number | null;
  address_lng: number | null;
  address_city: string | null;
  address_province: string | null;
  address_country: string | null;
  address_quality_score: number;
  address_found?: boolean;
  address_postal_code?: string | null;
  address_types?: string[];
  address_precision?: string | null;
  configured?: boolean;
  error?: string;
}
