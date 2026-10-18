"use client";

import { RequireRole } from "@/lib/session";
import { MarketBrowse } from "@/features/market/MarketBrowse";

/** Marketplace browse (open listings) for every signed-in role. */
export default function MarketRoute() {
  return (
    <RequireRole roles={["farmer", "customer", "admin"]}>
      {(user) => <MarketBrowse user={user} />}
    </RequireRole>
  );
}
