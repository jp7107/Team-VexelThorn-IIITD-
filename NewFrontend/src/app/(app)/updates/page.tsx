"use client";

import { UpdatesList } from "@/features/content/UpdatesList";
import { RequireRole } from "@/lib/session";

/** Agricultural updates published by administrators, newest first. */
export default function UpdatesRoute() {
  return <RequireRole roles={["farmer", "customer", "admin"]}>{() => <UpdatesList />}</RequireRole>;
}
