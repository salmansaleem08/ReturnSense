/**
 * Canonical dashboard / deep-link base URL for emails, extension, and API responses.
 * Priority: explicit env → Vercel deployment URL → production default.
 */
export function getPublicAppUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");

  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//i, "");
    return `https://${host}`;
  }

  return "https://return-sense-web.vercel.app";
}
