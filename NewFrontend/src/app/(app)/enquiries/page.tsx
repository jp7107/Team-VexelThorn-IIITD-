"use client";

import { RequireRole } from "@/lib/session";
import { Enquiries } from "@/features/enquiries/Enquiries";

/** Enquiries: farmers see received buyer enquiries, customers see the ones they sent. */
export default function EnquiriesPage() {
  return (
    <RequireRole roles={["farmer", "customer"]}>
      {(user) => <Enquiries user={user} />}
    </RequireRole>
  );
}
