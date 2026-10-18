"use client";

import { RequireRole } from "@/lib/session";
import { ListingDetail } from "@/features/market/ListingDetail";

/** One listing: buyers enquire, the owner manages status, admins moderate. */
export default function ListingRoute() {
  return (
    <RequireRole roles={["farmer", "customer", "admin"]}>
      {(user) => <ListingDetail user={user} />}
    </RequireRole>
  );
}
