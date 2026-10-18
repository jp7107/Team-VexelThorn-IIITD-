"use client";

import { RequireRole } from "@/lib/session";
import { Dashboard } from "@/features/dashboard/Dashboard";

/** Kisan Mitra overview dashboard (farmer). Customers are sent to /market, admins to /admin. */
export default function HomePage() {
  return <RequireRole roles={["farmer"]}>{(user) => <Dashboard user={user} />}</RequireRole>;
}
