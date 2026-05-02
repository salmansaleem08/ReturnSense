/**
 * SECURITY — read before filling:
 * - Use Supabase → Settings → API → Project URL (https://<ref>.supabase.co) and the publishable key.
 * - You may use the legacy JWT "anon" key instead of sb_publishable_* (same header: apikey).
 * - NEVER put sb_secret_* / service_role / database passwords in this file or anywhere in the extension.
 *
 * Setup: copy this file to popup-config.js (same folder) and fill values.
 *   cp extension/popup-config.example.js extension/popup-config.js
 *
 * popup-config.js is gitignored so secrets are not committed.
 */
window.RS_POPUP_CONFIG = {
  SUPABASE_URL: "",
  /** Publishable (sb_publishable_…) or legacy anon JWT — NOT secret/service_role */
  SUPABASE_ANON_KEY: "",
  APP_URL: "https://return-sense-web.vercel.app"
};
