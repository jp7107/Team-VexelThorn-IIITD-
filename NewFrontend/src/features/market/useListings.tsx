"use client";

// Offset pagination for GET /listings. A full page (rows.length === PAGE) means there may be another page;
// a short page is the end. Filter changes reset the list, and responses from an old query are discarded.
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiError, type Listing } from "@/lib/api";

export const LISTINGS_PAGE = 24;

type State = {
  rows: Listing[];
  loading: boolean;
  loadingMore: boolean;
  error: ApiError | null;
  hasMore: boolean;
  loadMore: () => void;
  reload: () => void;
};

export function useListingFeed(query: string, enabled = true): State {
  const [rows, setRows] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [reloadTick, setReloadTick] = useState(0);
  const busyRef = useRef(false);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // A new query (or an explicit reload) starts again from offset 0. Reset while rendering (React's
  // "adjust state when a prop changes" pattern) instead of in an effect, so no stale frame is committed.
  const feedKey = `${enabled ? 1 : 0}|${reloadTick}|${query}`;
  const [activeKey, setActiveKey] = useState(feedKey);
  if (activeKey !== feedKey) {
    setActiveKey(feedKey);
    setOffset(0);
    setRows([]);
    setHasMore(false);
    setError(null);
    setLoading(enabled);
    setLoadingMore(false);
  }

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    let cancelled = false;
    busyRef.current = true;
    const path = `${query}${query.includes("?") ? "&" : "?"}limit=${LISTINGS_PAGE}&offset=${offset}`;

    api<Listing[]>(path, { signal: controller.signal })
      .then((page) => {
        if (cancelled || !alive.current) return;
        setRows((prev) => {
          if (offset === 0) return page;
          const seen = new Set(prev.map((r) => r.id));
          return [...prev, ...page.filter((r) => !seen.has(r.id))];
        });
        setHasMore(page.length === LISTINGS_PAGE);
        setError(null);
        busyRef.current = false;
      })
      .catch((e) => {
        if (cancelled || !alive.current) return;
        busyRef.current = false;
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof ApiError ? e : new ApiError(0, "ERROR", e instanceof Error ? e.message : "Request failed"));
      })
      .finally(() => {
        if (cancelled || !alive.current) return;
        setLoading(false);
        setLoadingMore(false);
      });

    return () => {
      cancelled = true;
      busyRef.current = false;
      controller.abort();
    };
  }, [query, offset, enabled, reloadTick]);

  const loadMore = useCallback(() => {
    if (busyRef.current) return;
    busyRef.current = true;
    setLoadingMore(true);
    setOffset((o) => o + LISTINGS_PAGE);
  }, []);

  const reload = useCallback(() => setReloadTick((n) => n + 1), []);

  return { rows, loading, loadingMore, error, hasMore, loadMore, reload };
}
