"use client";

import { RequireRole } from "@/lib/session";
import { AdvicePage } from "@/features/advice/AdvicePage";

/** Irrigation & advice (farmer): field-condition summary, crops, reminders and honest guidance. */
export default function Page() {
  return <RequireRole roles={["farmer"]}>{() => <AdvicePage />}</RequireRole>;
}
