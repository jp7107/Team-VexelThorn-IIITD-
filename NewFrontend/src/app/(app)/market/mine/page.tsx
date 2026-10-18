"use client";

import { Suspense } from "react";
import { PageSkeleton, RequireRole } from "@/lib/session";
import { MyListings } from "@/features/market/MyListings";

/** Farmer's own listings. MyListings reads ?new=1 / ?edit= via useSearchParams, hence the Suspense boundary. */
export default function MyListingsRoute() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <RequireRole roles={["farmer"]}>{(user) => <MyListings user={user} />}</RequireRole>
    </Suspense>
  );
}
