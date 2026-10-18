"use client";

import { RequireRole } from "@/lib/session";
import { HelpPage } from "@/features/help/HelpPage";

/** Help & Videos: product walkthrough, verified FAQs, live readiness status, and honest gap notices. */
export default function Page() {
  return (
    <RequireRole roles={["farmer", "customer", "admin"]}>
      {(user) => <HelpPage role={user.role} />}
    </RequireRole>
  );
}
