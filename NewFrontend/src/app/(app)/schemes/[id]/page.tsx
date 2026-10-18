"use client";

import { SchemeDetail } from "@/features/content/SchemeDetail";
import { RequireRole } from "@/lib/session";

/** One scheme with its official source and last-verified date. */
export default function SchemeDetailRoute() {
  return <RequireRole roles={["farmer", "customer", "admin"]}>{() => <SchemeDetail />}</RequireRole>;
}
