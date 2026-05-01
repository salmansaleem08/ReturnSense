const requiredVars = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GEMINI_API_KEY",
  "OPENROUTER_API_KEY",
  "ABSTRACT_API_KEY",
  "GOOGLE_MAPS_API_KEY",
  "NEXT_PUBLIC_APP_URL"
] as const;

export function validateEnv() {
  const missing: string[] = requiredVars.filter((key) => !process.env[key]);
  const hasPublicSupabaseKey =
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);

  if (!hasPublicSupabaseKey) {
    missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}
