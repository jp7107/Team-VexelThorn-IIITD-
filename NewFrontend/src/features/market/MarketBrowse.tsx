"use client";

import { useMemo, useState } from "react";
import { Button, ButtonLink, EmptyState, ErrorState, PageHeading, Panel } from "@/components/ui";
import { CartIcon, PlusIcon, SearchIcon } from "@/components/icons";
import { describeError, type User } from "@/lib/api";
import { CROP_OPTIONS, STATES, cropLabel } from "@/lib/format";
import { ListingCard, ListingCardSkeleton } from "@/features/market/ListingCard";
import { CropGlyph } from "@/features/market/MarketArt";
import { useMarketI18n } from "@/features/market/i18n";
import { LISTINGS_PAGE, useListingFeed } from "@/features/market/useListings";
import "./market.css";

/** GET /listings (open only) with crop, state and wholesale minimum-lot filters. */
export function MarketBrowse({ user }: { user: User }) {
  const { t, lang } = useMarketI18n();
  const wholesale = user.customer_type === "wholesale";

  const [crop, setCrop] = useState<string>("");
  const [state, setState] = useState<string>("");
  const [minInput, setMinInput] = useState<string>("");
  const [minQuintal, setMinQuintal] = useState<string>("");

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (crop) params.set("crop_code", crop);
    if (state) params.set("state", state);
    if (wholesale && minQuintal) params.set("min_quintal", minQuintal);
    const qs = params.toString();
    return qs ? `/listings?${qs}` : "/listings";
  }, [crop, state, minQuintal, wholesale]);

  const feed = useListingFeed(query);
  const filtersActive = Boolean(crop || state || (wholesale && minQuintal));

  function applyMin(e: { preventDefault: () => void }) {
    e.preventDefault();
    const n = Number(minInput);
    setMinQuintal(minInput.trim() !== "" && Number.isFinite(n) && n > 0 ? String(n) : "");
  }

  function clearFilters() {
    setCrop("");
    setState("");
    setMinInput("");
    setMinQuintal("");
  }

  return (
    <div className="kmx-market">
      <PageHeading
        title={t("market.title")}
        subtitle={t("market.subtitle")}
        actions={
          user.role === "farmer" ? (
            <ButtonLink href="/market/mine" variant="secondary" size="sm">
              <CartIcon size={14} /> {t("market.myListings")}
            </ButtonLink>
          ) : user.role === "customer" ? (
            <ButtonLink href="/enquiries" variant="secondary" size="sm">
              {t("market.myEnquiries")}
            </ButtonLink>
          ) : undefined
        }
      />

      <Panel title={t("market.filters")} icon={<SearchIcon size={17} style={{ color: "var(--km-green-700)" }} />}>
        <div role="group" aria-label={t("market.crop")}>
          <div className="kmx-chip-row">
            <span className="kmx-chip-row-label">{t("market.crop")}</span>
            <button
              type="button"
              className="kmx-chip"
              aria-pressed={crop === ""}
              onClick={() => setCrop("")}
            >
              {t("market.allCrops")}
            </button>
            {CROP_OPTIONS.map((code) => (
              <button
                key={code}
                type="button"
                className="kmx-chip"
                aria-pressed={crop === code}
                onClick={() => setCrop((c) => (c === code ? "" : code))}
              >
                <CropGlyph crop={code} size={13} />
                {cropLabel(code, lang)}
              </button>
            ))}
          </div>
        </div>

        <div className="kmx-filter-row">
          <label className="kmx-filter-field">
            <span className="km-label">{t("market.state")}</span>
            <select className="km-select" value={state} onChange={(e) => setState(e.target.value)}>
              <option value="">{t("market.allStates")}</option>
              {STATES.map((s) => (
                <option key={s.value} value={s.value}>
                  {lang === "hi" ? s.hi : s.value}
                </option>
              ))}
            </select>
          </label>

          {wholesale && (
            <form className="kmx-filter-field" onSubmit={applyMin} style={{ minWidth: 210 }}>
              <label className="km-label" htmlFor="kmx-min-quintal">
                {t("market.minQuintal")}
              </label>
              <span className="kmx-price-form">
                <input
                  id="kmx-min-quintal"
                  className="km-input"
                  type="number"
                  inputMode="decimal"
                  min={1}
                  step="1"
                  placeholder={t("market.minQuintalPlaceholder")}
                  value={minInput}
                  onChange={(e) => setMinInput(e.target.value)}
                  style={{ maxWidth: 110 }}
                />
                <Button type="submit" size="sm" variant="secondary">
                  {t("market.applyFilters")}
                </Button>
              </span>
              <span className="km-hint">{t("market.minQuintalHint")}</span>
            </form>
          )}

          <span className="kmx-filter-spacer" />
          {filtersActive && (
            <Button type="button" size="sm" variant="ghost" onClick={clearFilters}>
              {t("market.clearFilters")}
            </Button>
          )}
        </div>

        {wholesale && <p className="kmx-wholesale-note">{t("market.wholesaleNote")}</p>}
      </Panel>

      <div className="kmx-results-head" aria-live="polite">
        <span>
          {feed.loading
            ? t("common.loading")
            : t("market.showingCount", { count: feed.rows.length })}
        </span>
        {feed.rows.length > 0 && <span aria-hidden="true">·</span>}
        {feed.rows.length > 0 && <span>{t("market.listingsCount", { count: feed.rows.length })}</span>}
      </div>

      {feed.loading ? (
        <div className="kmx-grid" aria-busy="true" aria-label={t("market.loadingListings")}>
          {Array.from({ length: 8 }).map((_, i) => (
            <ListingCardSkeleton key={i} />
          ))}
        </div>
      ) : feed.error ? (
        <ErrorState message={describeError(feed.error)} onRetry={feed.reload} />
      ) : feed.rows.length === 0 ? (
        <EmptyState
          title={t("market.emptyBrowse")}
          hint={t("market.emptyBrowseHint")}
          action={
            <span style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {filtersActive && (
                <Button size="sm" variant="secondary" onClick={clearFilters}>
                  {t("market.clearFilters")}
                </Button>
              )}
              {user.role === "farmer" ? (
                <ButtonLink href="/market/mine?new=1" size="sm">
                  <PlusIcon size={14} /> {t("market.addListing")}
                </ButtonLink>
              ) : (
                <ButtonLink href="/prices" size="sm" variant="secondary">
                  {t("market.viewPrices")}
                </ButtonLink>
              )}
            </span>
          }
        />
      ) : (
        <>
          <div className="kmx-grid">
            {feed.rows.map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>

          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            {feed.hasMore ? (
              <Button variant="secondary" onClick={feed.loadMore} disabled={feed.loadingMore} aria-busy={feed.loadingMore}>
                {feed.loadingMore ? t("market.loadingMore") : t("market.loadMore")}
              </Button>
            ) : (
              <span className="kmx-muted-note">{t("market.endOfResults")}</span>
            )}
          </div>
          <p className="km-footnote" style={{ textAlign: "center" }}>
            {t("market.artNote")} {feed.rows.length >= LISTINGS_PAGE ? "" : ""}
          </p>
        </>
      )}
    </div>
  );
}
