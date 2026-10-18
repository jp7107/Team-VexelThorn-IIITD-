"use client";

import { RequireRole } from "@/lib/session";
import { Assistant } from "@/features/assistant/Assistant";

/** AI assistant (any signed-in role). Chat is text-only; the backend owns routing, tools and safety copy. */
export default function AssistantPage() {
  return (
    <RequireRole roles={["farmer", "customer", "admin"]}>
      {(user) => <Assistant user={user} />}
    </RequireRole>
  );
}
