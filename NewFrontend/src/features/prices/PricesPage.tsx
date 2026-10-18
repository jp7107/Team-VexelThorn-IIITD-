"use client";

// Market Prices (/prices). Verified endpoints only:
//   GET /market/commodities        → string[]
//   GET /market/prices?commodity=&state=&district=&limit=50 → Prices
// Prices need a signed-in account; the route file wraps this view in <RequireRole>.

import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChartIcon, ClockIcon, DatabaseIcon, InfoIcon } from "@/components/icons";
import { Badge, EmptyState, ErrorState, PageHeading, Panel } from "@/components/ui";
import { describeError, type Prices } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useI18n } from "@/lib/i18n";
import { shortDate, timeAgo } from "@/lib/format";
import { PriceFilterPanel, type PriceFilters } from "./PriceFilters";
import { PriceResultsTable } from "./PriceResultsTable";
import "./prices.css";

const LIMIT = 50;
const DISTRICT_DEBOUNCE_MS = 350;

/** Build the prices path; `null` (no request) until a commodity is known. */
function pricesPath(f: PriceFilters): string | null {
  const commodity = f.commodity.trim();
  if (!commodity) return null;
  const qs = new URLSearchParams({ commodity, limit: String(LIMIT) });
  const state = f.state.trim();
  const district = f.district.trim();
  if (state) qs.set("state", state);
  if (district) qs.set("district", district);
  return `/market/prices?${qs.toString()}`;
}

export function PricesView() {
  const { t } = useI18n();

  const commodities = useApi<string[]>("/market/commodities");
  const [filters, setFilters] = useState<PriceFilters>({ commodity: "Tomato", state: "", district: "" });
  const [districtInput, setDistrictInput] = useState("");

  // Trim + debounce the free-text district before it joins the request path.
  useEffect(() => {
    const next = districtInput.trim();
    if (next === filters.district) return;
    const id = window.setTimeout(() => {
      setFilters((f) => ({ ...f, district: next }));
    }, DISTRICT_DEBOUNCE_MS);
    return () => window.clearTimeout(id);
  }, [districtInput, filters.district]);

  // The request is behind the typed text while the debounce runs.
  const districtDebouncing = districtInput.trim() !== filters.district;

  const onChange = useCallback((next: Partial<PriceFilters>) => {
    setFilters((f) => ({ ...f, ...next }));
  }, []);

  const reset = useCallback(() => {
    setDistrictInput("");
    setFilters({ commodity: "Tomato", state: "", district: "" });
  }, []);

  const path = useMemo(() => pricesPath(filters), [filters]);
  const prices = useApi<Prices>(path);

  const meta = prices.data?.meta;
  const rows = prices.data?.rows ?? [];
  const anyDemo = meta?.source_status === "demo" || rows.some((r) => r.is_demo);
  const hasCommodity = filters.commodity.trim().length > 0;

  return (
    <div className="km-prices">
      <PageHeading title={t("prices.title")} subtitle={t("prices.subtitle")} />

      <Panel title={t("prices.filtersTitle")} icon={<BarChartIcon size={17} style={{ color: "var(--km-green-700)" }} />}>
        <PriceFilterPanel
          commodities={commodities.data}
          commoditiesLoading={commodities.loading}
          commoditiesError={Boolean(commodities.error)}
          filters={filters}
          onChange={onChange}
          onReset={reset}
        />
      </Panel>

      <Panel
        title={t("prices.resultsTitle")}
        icon={<BarChartIcon size={17} style={{ color: "var(--km-green-700)" }} />}
        badge={anyDemo ? <Badge tone="sample">{t("prices.sampleBadge")}</Badge> : undefined}
        style={{ minHeight: 260 }}
      >
        {!hasCommodity ? (
          <EmptyState title={t("prices.chooseCommodity")} hint={t("prices.chooseCommodityHint")} />
        ) : prices.error ? (
          <ErrorState message={describeError(prices.error)} onRetry={prices.reload} />
        ) : prices.loading && !prices.data ? (
          <>
            <div className="km-skeleton" style={{ height: 40 }} />
            <PriceResultsTable rows={rows} loading updating={false} />
          </>
        ) : (
          <>
            <MetaStrip
              meta={meta}
              rows={rows}
              anyDemo={anyDemo}
              updating={prices.loading || districtDebouncing}
            />

            {rows.length === 0 ? (
              <div style={{ marginTop: 10 }}>
                <EmptyState
                  title={t("prices.noneTitle", { commodity: filters.commodity.trim() })}
                  hint={t("prices.noneHint")}
                />
              </div>
            ) : (
              <PriceResultsTable rows={rows} loading={false} updating={prices.loading} />
            )}

            <p className="km-footnote km-prices-footnote">
              {anyDemo
                ? t("prices.sampleFootnote")
                : t("prices.liveFootnote", { count: rows.length })}
            </p>
          </>
        )}
      </Panel>

      <p className="km-footnote" style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
        <InfoIcon size={13} style={{ flex: "none", marginTop: 1 }} />
        {t("prices.signInNote")}
      </p>
    </div>
  );
}

/* ---------------- meta strip ---------------- */

function MetaStrip({
  meta,
  rows,
  anyDemo,
  updating,
}: {
  meta: Prices["meta"] | undefined;
  rows: Prices["rows"];
  anyDemo: boolean;
  updating: boolean;
}) {
  const { t, lang } = useI18n();

  const sources = useMemo(() => [...new Set(rows.map((r) => r.source).filter(Boolean))], [rows]);
  const lastFetch = meta?.last_fetch_at ?? rows.reduce<string | null>((acc, r) => (acc && acc > r.fetched_at ? acc : r.fetched_at), null);
  const status = meta?.source_status;

  return (
    <div className={`km-prices-meta${anyDemo ? " sample" : ""}`} role="status" aria-live="polite">
      <span className="km-prices-meta-item">
        <strong>{t("prices.metaSource")}:</strong>
        {anyDemo ? (
          <Badge tone="sample">{t("prices.sampleBadge")}</Badge>
        ) : status === "live" ? (
          <Badge tone="good">{t("prices.statusLive")}</Badge>
        ) : status === "cached" ? (
          <Badge tone="info">{t("prices.statusCached")}</Badge>
        ) : (
          <Badge tone="neutral">{t("prices.statusNone")}</Badge>
        )}
      </span>

      {sources.length > 0 && (
        <span className="km-prices-meta-item">
          <DatabaseIcon size={13} />
          <span title={sources.join(", ")}>
            {sources.length === 1 ? sources[0] : t("prices.sourceCount", { count: sources.length })}
          </span>
        </span>
      )}

      {lastFetch && (
        <span className="km-prices-meta-item">
          <ClockIcon size={13} />
          <span title={shortDate(lastFetch, lang)}>
            {t("prices.lastFetch", { when: timeAgo(lastFetch, lang) })}
          </span>
        </span>
      )}

      <span className="km-prices-meta-end">
        {updating ? t("prices.updating") : t("prices.rowCount", { count: rows.length })}
      </span>
    </div>
  );
}
