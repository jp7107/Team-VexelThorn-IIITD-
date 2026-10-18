"use client";

// Small client-side fetch hook for the dashboard: one request, optional polling refetch, abort on unmount.
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api";

type Result<T> = {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
};

export function useApi<T>(path: string | null, opts: { timeoutMs?: number } = {}): Result<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [tick, setTick] = useState(0);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    api<T>(path, { signal: controller.signal, timeoutMs: opts.timeoutMs })
      .then((d) => {
        if (!alive.current) return;
        setData(d);
        setError(null);
      })
      .catch((e) => {
        if (!alive.current) return;
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(
          e instanceof ApiError
            ? e
            : e instanceof Error
              ? new ApiError(0, "ERROR", e.message)
              : new ApiError(0, "ERROR", "Request failed"),
        );
      })
      .finally(() => {
        if (alive.current) setLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, tick]);

  const reload = useCallback(() => setTick((n) => n + 1), []);
  return { data, error, loading, reload };
}
