"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, ApiError, homeFor, type User, type UserRole } from "@/lib/api";

/**
 * Loads the logged-in user and sends everyone else where they belong.
 * Routing only: the backend enforces every permission itself.
 */
export function useSession(roles: UserRole[]) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const rolesKey = roles.join(",");

  useEffect(() => {
    let cancelled = false;
    api<User>("/auth/me")
      .then((me) => {
        if (cancelled) return;
        if (!rolesKey.split(",").includes(me.role)) router.replace(homeFor(me));
        else setUser(me);
      })
      .catch((e: ApiError) => {
        if (cancelled) return;
        if (e.status === 401) router.replace("/login");
        else setError(e);
      });
    return () => {
      cancelled = true;
    };
  }, [rolesKey, router]);

  return { user, error };
}
