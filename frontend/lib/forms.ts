import { ApiError } from "@/lib/api";

export const PHONE_RE = /^[6-9]\d{9}$/;

/** Turns an API failure into a dictionary key, so errors show in the user's language. */
export function errorKey(e: unknown, overrides: Partial<Record<string, string>> = {}): string {
  if (!(e instanceof ApiError)) return "errors.generic";
  if (e.code === "TIMEOUT") return "chat.timeout";
  if (e.status === 0) return "errors.network";
  return overrides[e.code] ?? "errors.generic";
}

/** Props that tie an input to its hint and error text for screen readers. */
export function describedBy(id: string, hint: boolean, error?: string) {
  const ids = [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(" ");
  return { id, "aria-invalid": Boolean(error), "aria-describedby": ids || undefined };
}
