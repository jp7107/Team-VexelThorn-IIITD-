"use client";

// Small form helpers shared by the auth screens. Kept local to the feature (the shared primitives are
// read-only for feature agents) and deliberately thin: labelled control, hint, inline error, alert region.

import type { ReactNode } from "react";
import { AlertIcon } from "@/components/icons";

/** Indian mobile number, exactly 10 digits, first digit 6-9 (mirrors the backend `Phone` type). */
export const PHONE_RE = /^[6-9]\d{9}$/;

/** Phone inputs stay numeric and never exceed the backend's 10 digits. */
export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "").slice(0, 10);
}

/**
 * Only allow redirects that stay inside this origin: a rooted path, but not protocol-relative (`//host`,
 * or `/\host` which browsers also read as another host).
 */
export function safeNextPath(next: string | null | undefined): string | null {
  if (!next) return null;
  if (!next.startsWith("/")) return null;
  if (next.startsWith("//") || next.startsWith("/\\")) return null;
  return next;
}

type ControlProps = { id: string; "aria-invalid"?: true; "aria-describedby"?: string };

/** Label + control + hint + inline error, wired together with ids for screen readers. */
export function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | null;
  children: (props: ControlProps) => ReactNode;
}) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-err` : null].filter(Boolean).join(" ");
  const control: ControlProps = { id };
  if (error) control["aria-invalid"] = true;
  if (describedBy) control["aria-describedby"] = describedBy;

  return (
    <div className="km-field">
      <label className="km-label" htmlFor={id}>
        {label}
      </label>
      {children(control)}
      {hint && (
        <p className="km-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {error && (
        <p className="km-error" id={`${id}-err`}>
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Always-mounted live region for API errors, so a message that appears after submit is announced.
 * Renders nothing visible while `message` is null.
 */
export function FormError({ message }: { message: string | null }) {
  return (
    <div className="km-auth-formerror" aria-live="polite">
      {message && (
        <div className="km-auth-alert">
          <AlertIcon size={15} />
          <span>{message}</span>
        </div>
      )}
    </div>
  );
}
