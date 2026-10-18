"use client";

import { Suspense } from "react";
import { LoadingBlock } from "@/components/ui";
import { LoginForm } from "@/features/auth/LoginForm";

/**
 * Sign-in. The form reads `?next=` to return the visitor to the page that sent them here, so it is wrapped
 * in Suspense (useSearchParams must not run during the static prerender).
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<LoadingBlock lines={5} height={34} />}>
      <LoginForm />
    </Suspense>
  );
}
