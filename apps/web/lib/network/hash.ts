import { createHash } from "crypto";

/** Lowercase handle without @ — one-way hash for shared network layer only. */
export function hashInstagramUsername(username: string): string {
  const n = username.trim().toLowerCase().replace(/^@/, "");
  return createHash("sha256").update(n, "utf8").digest("hex");
}

/** Digits-only normalization — hash only; never store plaintext phone in network tables. */
export function hashPhoneDigits(phone: string): string | null {
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return null;
  return createHash("sha256").update(digits, "utf8").digest("hex");
}
