"use client";

import { RequireRole } from "@/lib/session";
import { PricesView } from "@/features/prices/PricesPage";

/** Mandi prices for every signed-in role (farmer, buyer, admin). */
export default function PricesRoute() {
  return (
    <RequireRole roles={["farmer", "customer", "admin"]}>
      {() => <PricesView />}
    </RequireRole>
  );
}
