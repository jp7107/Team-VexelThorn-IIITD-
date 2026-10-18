"use client";

import { SchemesList } from "@/features/content/SchemesList";
import { RequireRole } from "@/lib/session";

/** Published government schemes, filtered to the user's state by default. */
export default function SchemesRoute() {
  return (
    <RequireRole roles={["farmer", "customer", "admin"]}>
      {(user) => <SchemesList user={user} />}
    </RequireRole>
  );
}
