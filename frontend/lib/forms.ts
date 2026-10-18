import { ApiError } from "@/lib/api";

export const PHONE_RE = /^[6-9]\d{9}$/;

/** Turns an API failure into a dictionary key, so errors show in the user's language. */
// Backend error codes that have their own message (messages/*.json "errors.<CODE>").
const EXPLAINED = new Set(["NOT_ENOUGH_STOCK", "BELOW_MIN_ORDER", "PRICE_REQUIRED", "UPI_REF_REQUIRED",
  "METHOD_UNAVAILABLE", "GATEWAY_ERROR", "BAD_SIGNATURE", "ACCOUNT_BLOCKED", "CROP_NOT_LISTED", "ASSISTANT_OFF"]);

export function errorKey(e: unknown, overrides: Partial<Record<string, string>> = {}): string {
  if (!(e instanceof ApiError)) return "errors.generic";
  if (e.code === "TIMEOUT") return "chat.timeout";
  if (e.code === "RATE_LIMITED") return "errors.rateLimited";
  if (e.status === 0) return "errors.network";
  if (overrides[e.code]) return overrides[e.code]!;
  if (EXPLAINED.has(e.code)) return `errors.${e.code}`;
  if (e.status === 409) return "errors.conflict";
  return "errors.generic";
}

/** Props that tie an input to its hint and error text for screen readers. */
export function describedBy(id: string, hint: boolean, error?: string) {
  const ids = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ");
  return { id, "aria-invalid": Boolean(error), "aria-describedby": ids || undefined };
}
