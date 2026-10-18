"use client";

// Small form primitives and client-side validation for the admin console.
// Rules mirror the backend (backend/app/routers/content.py): https-only URLs ≤ 500 chars, scheme texts
// ≤ 2000, update body ≤ 4000, at most 40 states of ≤ 60 chars each. The server stays the authority;
// these checks only avoid a pointless round-trip and point at the field.

import type { ReactNode } from "react";

export type Errors = Record<string, string>;

export function Field({
  id,
  label,
  hint,
  error,
  required,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="km-field">
      <label className="km-label" htmlFor={id}>
        {label}
        {required && (
          <span aria-hidden="true" style={{ color: "var(--km-red-600)", marginLeft: 3 }}>
            *
          </span>
        )}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="km-error" role="alert">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="km-hint">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

export function fieldProps(id: string, error?: string): {
  id: string;
  "aria-invalid"?: true;
  "aria-describedby"?: string;
} {
  return error
    ? { id, "aria-invalid": true, "aria-describedby": `${id}-error` }
    : { id };
}

export type UrlCheck = "required" | "optional";

/** True when the string is a well-formed absolute https URL within the server's 500-char limit. */
export function isHttpsUrl(value: string): boolean {
  if (value.length === 0 || value.length > 500) return false;
  try {
    const u = new URL(value);
    return u.protocol === "https:" && u.hostname.length > 0;
  } catch {
    return false;
  }
}

/** URL field rule shared by schemes and updates. Returns an error key suffix, or null when valid. */
export function urlError(value: string, mode: UrlCheck): "required" | "httpsOnly" | "urlMax" | null {
  const v = value.trim();
  if (v === "") return mode === "required" ? "required" : null;
  if (v.length > 500) return "urlMax";
  if (!isHttpsUrl(v)) return "httpsOnly";
  return null;
}

/** Trimmed length check with a message key. */
export function lengthError(value: string, min: number, max: number, overKey: string): string | null {
  const v = value.trim();
  if (v.length < min) return "required";
  if (v.length > max) return overKey;
  return null;
}

export function Notice({
  tone,
  children,
}: {
  tone: "good" | "bad";
  children: ReactNode;
}) {
  return (
    <div className={`ka-notice ${tone}`} role={tone === "bad" ? "alert" : "status"} aria-live="polite">
      {children}
    </div>
  );
}

/** Today's date as YYYY-MM-DD for <input type="date"> defaults. */
export function todayIso(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
