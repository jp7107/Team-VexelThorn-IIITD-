"use client";

// One /auth/me call per page load, shared through context. Routing is only a convenience: the FastAPI
// backend enforces every role check itself.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { api, ApiError, homeFor, type User } from "@/lib/api";

type State = {
  user: User | null;
  loading: boolean;
  error: ApiError | null;
  refresh: () => Promise<User | null>;
  logout: () => Promise<void>;
};

const SessionContext = createContext<State | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);

  const refresh = useCallback(async () => {
    try {
      const me = await api<User>("/auth/me");
      setUser(me);
      setError(null);
      return me;
    } catch (e) {
      const err = e instanceof ApiError ? e : new ApiError(0, "ERROR", "Session could not be loaded");
      setUser(null);
      setError(err.status === 401 ? null : err);
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    setUser(null);
  }, []);

  const value = useMemo(() => ({ user, loading, error, refresh, logout }), [user, loading, error, refresh, logout]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): State {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside SessionProvider");
  return ctx;
}

/**
 * Client-side role gate. Renders a skeleton while the session loads; sends signed-out visitors to
 * /login?next=…; sends signed-in users of another role to their own home.
 */
export function RequireRole({
  roles,
  children,
}: {
  roles: User["role"][];
  children: (user: User) => ReactNode;
}) {
  const { user, loading, error } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      const next = typeof window === "undefined" ? "/" : window.location.pathname + window.location.search;
      router.replace(`/login?next=${encodeURIComponent(next)}`);
      return;
    }
    if (!roles.includes(user.role)) router.replace(homeFor(user));
  }, [loading, user, roles, router]);

  if (loading) return <PageSkeleton />;
  if (error) {
    return (
      <div className="km-state error" role="alert">
        <span className="km-state-title">Could not verify your session</span>
        <span>{error.message}</span>
      </div>
    );
  }
  if (!user || !roles.includes(user.role)) return <PageSkeleton />;
  return <>{children(user)}</>;
}

/** Neutral page skeleton used while the session or a first paint resolves. */
export function PageSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" style={{ display: "grid", gap: "var(--km-gap)" }}>
      <div className="km-skeleton" style={{ height: 96 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "var(--km-gap)" }}>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="km-skeleton" style={{ height: 124 }} />
        ))}
      </div>
    </div>
  );
}
