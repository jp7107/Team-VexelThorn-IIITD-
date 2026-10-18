"use client";

// Scheme detail — GET /schemes/{id}. Every claim is framed by the last-verified date and the official
// source link; benefit wording is never invented when the API has none.

import Link from "next/link";
import { useParams } from "next/navigation";
import { CheckIcon, InfoIcon, LandmarkIcon, MapPinIcon, ShieldIcon } from "@/components/icons";
import { ArrowLeftIcon, ExternalIcon } from "@/features/content/icons";
import { Badge, ButtonLink, ErrorState, LoadingBlock, PageHeading, Panel } from "@/components/ui";
import { describeError, type Scheme } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { STATES, shortDate } from "@/lib/format";
import { useContentI18n } from "@/features/content/ns";
import "./content.css";

export function SchemeDetail() {
  const { t, lang } = useContentI18n();
  const params = useParams<{ id: string }>();
  const id = typeof params?.id === "string" ? params.id : Array.isArray(params?.id) ? params.id[0] : "";

  // GET /schemes/{id} → 404 when missing (or unpublished for non-admins).
  const { data, error, loading, reload } = useApi<Scheme>(id ? `/schemes/${encodeURIComponent(id)}` : null);

  if (loading) {
    return (
      <div className="kc-page">
        <PageHeading title={t("content.detail.loading")} />
        <Panel>
          <LoadingBlock lines={4} height={18} />
        </Panel>
      </div>
    );
  }

  if (error?.status === 404) {
    return (
      <div className="kc-page">
        <PageHeading title={t("content.detail.notFoundTitle")} subtitle={t("content.detail.notFoundHint")} />
        <ButtonLink href="/schemes" variant="secondary" size="sm" style={{ alignSelf: "flex-start" }}>
          <ArrowLeftIcon size={14} /> {t("content.detail.back")}
        </ButtonLink>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="kc-page">
        <PageHeading title={t("content.schemes.title")} />
        <Panel title={t("content.schemes.errorTitle")}>
          <ErrorState message={error ? describeError(error) : t("content.schemes.errorTitle")} onRetry={reload} />
        </Panel>
        <ButtonLink href="/schemes" variant="secondary" size="sm" style={{ alignSelf: "flex-start" }}>
          <ArrowLeftIcon size={14} /> {t("content.detail.back")}
        </ButtonLink>
      </div>
    );
  }

  const s = data;
  const central = s.states.length === 0;
  const verified = shortDate(s.last_verified_at, lang);
  const stateNames = s.states.map((value) => ({
    value,
    label: lang === "hi" ? (STATES.find((x) => x.value === value)?.hi ?? value) : value,
  }));

  return (
    <div className="kc-page">
      <PageHeading
        title={s.name}
        subtitle={
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Badge tone={central ? "info" : "neutral"}>
              {central ? t("content.common.centralScheme") : t("content.common.stateScheme")}
            </Badge>
            {!s.published && <Badge tone="guidance">{t("content.common.unpublished")}</Badge>}
          </span>
        }
        actions={
          <ButtonLink href="/schemes" variant="secondary" size="sm">
            <ArrowLeftIcon size={14} /> {t("content.detail.back")}
          </ButtonLink>
        }
      />

      {/* Prominent verification band: the date is the first factual statement on the page. */}
      <div className={`kc-verified-band${s.last_verified_at ? "" : " unknown"}`} role="note">
        <span
          className="km-icon-tile"
          style={{ width: 32, height: 32, borderRadius: 9, background: "#fff", color: "var(--km-green-700)" }}
          aria-hidden="true"
        >
          <ShieldIcon size={17} />
        </span>
        <div style={{ minWidth: 0 }}>
          <p className="kc-verified-date">{t("content.detail.verifiedOn", { date: verified })}</p>
          <p className="km-caption" style={{ marginTop: 2 }}>
            {t("content.detail.verifiedHint")}
          </p>
        </div>
      </div>

      <div className="kc-detail">
        <div className="kc-detail-main">
          <Panel
            title={t("content.detail.summary")}
            icon={<LandmarkIcon size={17} style={{ color: "var(--km-green-700)" }} />}
          >
            <p className="kc-prose">{s.summary}</p>
          </Panel>

          <Panel title={t("content.detail.eligibility")}>
            <p className="kc-prose">{s.eligibility_text}</p>
          </Panel>

          <Panel title={t("content.detail.benefits")}>
            {s.benefit_text && s.benefit_text.trim() !== "" ? (
              <p className="kc-prose">{s.benefit_text}</p>
            ) : (
              <div className="kc-source-note" role="note">
                <InfoIcon size={15} style={{ flex: "none", marginTop: 1 }} />
                <span>{t("content.detail.benefitsMissing")}</span>
              </div>
            )}
          </Panel>
        </div>

        <aside className="kc-detail-aside">
          <Panel title={t("content.detail.coverage")} icon={<MapPinIcon size={16} style={{ color: "var(--km-green-700)" }} />}>
            {central ? (
              <p className="km-caption">{t("content.detail.coverageAllIndia")}</p>
            ) : (
              <>
                <p className="km-caption" style={{ marginBottom: 7 }}>
                  {t("content.detail.coverageStates", { n: s.states.length })}
                </p>
                <div className="kc-states">
                  {stateNames.map((x) => (
                    <span key={x.value} className="kc-state-chip">
                      {x.label}
                    </span>
                  ))}
                </div>
              </>
            )}
          </Panel>

          <Panel title={t("content.detail.verifiedHeading")} icon={<CheckIcon size={16} style={{ color: "var(--km-green-700)" }} />}>
            <p className="kc-verified" style={{ marginBottom: 9 }}>
              <CheckIcon size={12} /> {t("content.common.lastVerified", { date: verified })}
            </p>
            <a
              className="kc-official-link"
              href={s.official_url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`${t("content.detail.officialLink")} (${t("content.common.opensNewTab")})`}
            >
              <ExternalIcon size={14} />
              <span>
                {t("content.detail.officialLink")}
                <span className="km-sr-only"> — {t("content.common.opensNewTab")}</span>
              </span>
            </a>
            <p className="km-footnote" style={{ marginTop: 5, overflowWrap: "anywhere" }}>
              {s.official_url}
            </p>
            <div className="kc-source-note" style={{ marginTop: 10 }}>
              <InfoIcon size={14} style={{ flex: "none", marginTop: 1 }} />
              <span>{t("content.schemes.verifiedNote")}</span>
            </div>
          </Panel>

          <Link href="/updates" className="km-linkish" style={{ paddingLeft: 2 }}>
            {t("content.schemes.updatesLink")} →
          </Link>
        </aside>
      </div>
    </div>
  );
}
