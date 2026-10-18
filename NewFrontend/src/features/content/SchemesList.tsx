"use client";

// Schemes list — GET /schemes?state= returns published schemes only, and the backend already includes
// central schemes (empty `states`) for every state. So the state filter is server-side, and we never filter
// those rows again on the client; the search box and the coverage filter narrow the received list.

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  ArrowRightIcon,
  CheckIcon,
  LandmarkIcon,
  MapPinIcon,
  SearchIcon,
} from "@/components/icons";
import { Badge, EmptyState, ErrorState, LoadingBlock, PageHeading, Panel } from "@/components/ui";
import { describeError, type Scheme } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { STATES, shortDate } from "@/lib/format";
import type { User } from "@/lib/api";
import { useContentI18n } from "@/features/content/ns";
import "./content.css";

type Scope = "all" | "central" | "state";

export function SchemesList({ user }: { user: User }) {
  const { t, lang } = useContentI18n();
  const [state, setState] = useState(user.state ?? "");
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");

  const path = `/schemes${state ? `?state=${encodeURIComponent(state)}` : ""}`;
  const { data, error, loading, reload } = useApi<Scheme[]>(path);

  const rows = useMemo(() => {
    const list = data ?? [];
    const q = query.trim().toLowerCase();
    return list.filter((s) => {
      if (scope === "central" && s.states.length > 0) return false;
      if (scope === "state" && s.states.length === 0) return false;
      if (!q) return true;
      return (
        s.name.toLowerCase().includes(q) ||
        s.summary.toLowerCase().includes(q) ||
        s.eligibility_text.toLowerCase().includes(q)
      );
    });
  }, [data, query, scope]);

  const filtersActive = query.trim() !== "" || state !== "" || scope !== "all";

  return (
    <div className="kc-page">
      <PageHeading
        title={t("content.schemes.title")}
        subtitle={t("content.schemes.subtitle")}
        actions={
          <Link href="/updates" className="km-linkish">
            {t("content.schemes.updatesLink")} <ArrowRightIcon size={12} />
          </Link>
        }
      />

      <Panel>
        <div className="kc-toolbar">
          <div className="km-field kc-search">
            <label className="km-label" htmlFor="kc-scheme-search">
              {t("content.schemes.searchLabel")}
            </label>
            <div style={{ position: "relative" }}>
              <SearchIcon
                size={15}
                style={{
                  position: "absolute",
                  left: 10,
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "var(--km-subtle)",
                  pointerEvents: "none",
                }}
              />
              <input
                id="kc-scheme-search"
                className="km-input"
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("content.schemes.searchPlaceholder")}
                style={{ paddingLeft: 31 }}
              />
            </div>
          </div>

          <label className="km-field kc-filter">
            <span className="km-label">{t("content.schemes.stateLabel")}</span>
            <select className="km-select" value={state} onChange={(e) => setState(e.target.value)}>
              <option value="">{t("content.schemes.stateAll")}</option>
              {STATES.map((s) => (
                <option key={s.value} value={s.value}>
                  {lang === "hi" ? s.hi : s.value}
                </option>
              ))}
            </select>
          </label>

          <label className="km-field kc-filter">
            <span className="km-label">{t("content.schemes.coverageLabel")}</span>
            <select className="km-select" value={scope} onChange={(e) => setScope(e.target.value as Scope)}>
              <option value="all">{t("content.schemes.coverageAll")}</option>
              <option value="central">{t("content.schemes.coverageCentral")}</option>
              <option value="state">{t("content.schemes.coverageState")}</option>
            </select>
          </label>
        </div>

        <div className="kc-toolbar-foot">
          <span className="km-caption" aria-live="polite">
            {loading
              ? t("content.schemes.loading")
              : data === null
                ? ""
                : filtersActive
                  ? rows.length === 1
                    ? t("content.schemes.matchCountOne", { n: rows.length })
                    : t("content.schemes.matchCountMany", { n: rows.length })
                  : data.length === 1
                    ? t("content.schemes.totalCountOne", { n: data.length })
                    : t("content.schemes.totalCountMany", { n: data.length })}
          </span>
          {filtersActive && (
            <button
              type="button"
              className="km-linkish"
              onClick={() => {
                setQuery("");
                setState("");
                setScope("all");
              }}
            >
              {t("content.common.clearFilters")}
            </button>
          )}
        </div>
      </Panel>

      {loading ? (
        <Panel title={t("content.schemes.title")}>
          <LoadingBlock lines={3} height={64} />
        </Panel>
      ) : error ? (
        <Panel title={t("content.schemes.errorTitle")}>
          <ErrorState message={describeError(error)} onRetry={reload} />
        </Panel>
      ) : data && data.length === 0 ? (
        <Panel title={t("content.schemes.title")}>
          <EmptyState title={t("content.schemes.emptyTitle")} hint={t("content.schemes.emptyHint")} />
        </Panel>
      ) : rows.length === 0 ? (
        <Panel title={t("content.schemes.title")}>
          <EmptyState
            title={t("content.schemes.noMatchTitle")}
            hint={t("content.schemes.noMatchHint")}
            action={
              <button
                type="button"
                className="km-btn secondary sm"
                onClick={() => {
                  setQuery("");
                  setState("");
                  setScope("all");
                }}
              >
                {t("content.common.clearFilters")}
              </button>
            }
          />
        </Panel>
      ) : (
        <div className="kc-cards">
          {rows.map((s) => (
            <SchemeCard key={s.id} scheme={s} lang={lang} />
          ))}
        </div>
      )}

      <p className="km-footnote">{t("content.schemes.verifiedNote")}</p>
    </div>
  );
}

function SchemeCard({ scheme, lang }: { scheme: Scheme; lang: "en" | "hi" }) {
  const { t } = useContentI18n();
  const central = scheme.states.length === 0;

  return (
    <article className="kc-card">
      <div className="kc-card-head">
        <span
          className="km-icon-tile"
          style={{
            width: 34,
            height: 34,
            borderRadius: 9,
            background: "var(--km-green-50)",
            color: "var(--km-green-700)",
          }}
          aria-hidden="true"
        >
          <LandmarkIcon size={17} />
        </span>
        <h2 className="kc-card-title" style={{ flex: 1, minWidth: 0 }}>
          <Link href={`/schemes/${scheme.id}`} className="kc-card-link">
            {scheme.name}
          </Link>
        </h2>
        <Badge tone={central ? "info" : "neutral"}>
          {central ? t("content.common.centralScheme") : t("content.common.stateScheme")}
        </Badge>
      </div>

      <p className="kc-card-summary">{scheme.summary}</p>

      <div className="kc-card-meta">
        {central ? (
          <span className="kc-state-chip">
            <MapPinIcon size={12} /> {t("content.common.allIndia")}
          </span>
        ) : (
          scheme.states.slice(0, 3).map((s) => (
            <span key={s} className="kc-state-chip">
              {s}
            </span>
          ))
        )}
        {scheme.states.length > 3 && (
          <span className="km-footnote">+{scheme.states.length - 3}</span>
        )}
      </div>

      <div className="kc-card-foot">
        <span className="kc-verified" title={t("content.common.lastVerified", { date: shortDate(scheme.last_verified_at, lang) })}>
          <CheckIcon size={12} />
          {t("content.common.lastVerified", { date: shortDate(scheme.last_verified_at, lang) })}
        </span>
        <Link href={`/schemes/${scheme.id}`} className="km-linkish">
          {t("content.common.viewScheme")} <ArrowRightIcon size={12} />
        </Link>
      </div>
    </article>
  );
}
