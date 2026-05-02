/** Production dashboard host (extension “View full report”, emails, API `dashboard_url`). */
const CANONICAL_APP_ORIGIN = "https://return-sense-web.vercel.app";

function isLegacyDeployUrl(url: string): boolean {
  const u = url.toLowerCase();
  return u.includes("onrender.com") || u.includes("returnsense.onrender");
}

/**
 * Canonical dashboard / deep-link base URL for emails, extension, and API responses.
 * Legacy Render URLs in `NEXT_PUBLIC_APP_URL` are ignored so deep links always hit Vercel.
 */
export function getPublicAppUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");
  if (explicit && !isLegacyDeployUrl(explicit)) return explicit;

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//i, "");
    return `https://${host}`;
  }

  return CANONICAL_APP_ORIGIN;
}
