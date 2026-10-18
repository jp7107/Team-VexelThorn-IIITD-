"use client";

// Crop history: the last 100 checks (newest first) with client-side status and crop filters.
// The API exposes no date range or pagination beyond `limit`, so the page is honest about showing 100.

import Link from "next/link";
import { useMemo, useState } from "react";
import { RequireRole } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { describeError, type Analysis, type AnalysisStatus } from "@/lib/api";
import { analysisStatusLabel, cropLabel, num, pct } from "@/lib/format";
import { Badge, Button, ButtonLink, EmptyState, ErrorState, LoadingBlock, PageHeading, Panel } from "@/components/ui";
import { ArrowRightIcon, CameraIcon, ClockIcon, LeafIcon } from "@/components/icons";
import { StatusBadge } from "@/features/health/components";
import { useHealthT } from "@/features/health/i18n";
import { ANALYSIS_STATUSES, analysisCrop, dateTime, outcomeOf } from "@/features/health/helpers";
import "@/features/health/health.css";

export default function HistoryPage() {
  return <RequireRole roles={["farmer"]}>{() => <History />}</RequireRole>;
}

function History() {
  const { t, lang } = useHealthT();
  const analyses = useApi<Analysis[]>("/me/analyses?limit=100");
  const [status, setStatus] = useState<AnalysisStatus | "all">("all");
  const [crop, setCrop] = useState<string>("all");

  const rows = useMemo(() => analyses.data ?? [], [analyses.data]);

  const crops = useMemo(() => {
    const seen = new Map<string, string>();
    for (const a of rows) {
      const code = a.prediction?.crop_code || a.crop_code_claimed;
      if (code && !seen.has(code)) seen.set(code, cropLabel(code, lang));
    }
    return [...seen.entries()].sort((a, b) => a[1].localeCompare(b[1], lang === "hi" ? "hi" : "en"));
  }, [rows, lang]);

  const statusCounts = useMemo(() => {
    const counts = new Map<AnalysisStatus, number>();
    for (const a of rows) counts.set(a.status, (counts.get(a.status) ?? 0) + 1);
    return counts;
  }, [rows]);

  const filtered = useMemo(
    () =>
      rows.filter((a) => {
        if (status !== "all" && a.status !== status) return false;
        if (crop !== "all" && (a.prediction?.crop_code || a.crop_code_claimed) !== crop) return false;
        return true;
      }),
    [rows, status, crop],
  );

  const filtering = status !== "all" || crop !== "all";

  return (
    <div className="kmh-page">
      <PageHeading
        title={t("health.historyTitle")}
        subtitle={t("health.historySubtitle")}
        actions={
          <ButtonLink href="/health/diagnose" size="sm">
            <CameraIcon size={14} /> {t("health.scanLeaf")}
          </ButtonLink>
        }
      />

      <Panel
        title={t("health.historyTitle")}
        icon={<ClockIcon size={18} style={{ color: "var(--km-green-700)" }} />}
        badge={
          analyses.data ? (
            <Badge tone="neutral">{t("health.checksCount", { count: num(rows.length, lang) })}</Badge>
          ) : undefined
        }
      >
        {analyses.loading ? (
          <LoadingBlock lines={6} height={30} />
        ) : analyses.error ? (
          <ErrorState message={describeError(analyses.error)} onRetry={analyses.reload} />
        ) : rows.length === 0 ? (
          <EmptyState
            title={t("health.noChecksTitle")}
            hint={t("health.noChecksHint")}
            action={
              <ButtonLink href="/health/diagnose" size="sm">
                <CameraIcon size={14} /> {t("health.scanLeaf")}
              </ButtonLink>
            }
          />
        ) : (
          <div className="kmh-stack-sm">
            <div className="kmh-filters">
              <div className="kmh-filter">
                <label className="km-label" htmlFor="kmh-status-filter">
                  {t("health.filterStatus")}
                </label>
                <select
                  id="kmh-status-filter"
                  className="km-select"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as AnalysisStatus | "all")}
                >
                  <option value="all">{t("health.allStatuses")}</option>
                  {ANALYSIS_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {analysisStatusLabel(s, lang)} ({statusCounts.get(s) ?? 0})
                    </option>
                  ))}
                </select>
              </div>
              <div className="kmh-filter">
                <label className="km-label" htmlFor="kmh-crop-filter">
                  {t("health.filterCrop")}
                </label>
                <select
                  id="kmh-crop-filter"
                  className="km-select"
                  value={crop}
                  onChange={(e) => setCrop(e.target.value)}
                >
                  <option value="all">{t("health.allCrops")}</option>
                  {crops.map(([code, label]) => (
                    <option key={code} value={code}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              {filtering && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setStatus("all");
                    setCrop("all");
                  }}
                >
                  {t("health.clearFilter")}
                </Button>
              )}
            </div>

            <p className="km-caption" role="status" aria-live="polite">
              {t("health.showingCount", { shown: num(filtered.length, lang), total: num(rows.length, lang) })}
            </p>

            {filtered.length === 0 ? (
              <EmptyState title={t("health.noChecksFiltered")} />
            ) : (
              <div className="km-scroll-x">
                <table className="km-table kmh-history-table">
                  <caption className="km-sr-only">{t("health.historySubtitle")}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t("health.colDate")}</th>
                      <th scope="col">{t("health.colCrop")}</th>
                      <th scope="col" className="kmh-col-result">
                        {t("health.colResult")}
                      </th>
                      <th scope="col">{t("health.colConfidence")}</th>
                      <th scope="col">{t("health.colModel")}</th>
                      <th scope="col">
                        <span className="km-sr-only">{t("health.colAction")}</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((a) => (
                      <tr key={a.id}>
                        <td style={{ whiteSpace: "nowrap" }}>{dateTime(a.created_at, lang)}</td>
                        <td style={{ whiteSpace: "nowrap", fontWeight: 600 }}>{analysisCrop(a, lang)}</td>
                        <td className="kmh-col-result">
                          <span className="kmh-result-cell">
                            <span className="kmh-result-cell-title">
                              {resultLine(a, lang, t)}
                            </span>
                            <span>
                              <StatusBadge analysis={a} />
                            </span>
                          </span>
                        </td>
                        <td className="kmh-num">{a.confidence === null ? "—" : pct(a.confidence)}</td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          <code className="kmh-code">{a.model.version}</code>
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <Link href={`/analyses/${a.id}`} className="km-linkish" aria-label={`${t("health.viewResult")} ${analysisCrop(a, lang)}`}>
                            {t("health.viewResult")} <ArrowRightIcon size={12} />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </Panel>

      <p className="km-footnote" style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <LeafIcon size={12} /> {t("health.notADiagnosis")}
      </p>
    </div>
  );
}

/** One-line result for the table; keeps status wording short enough for a dense row. */
function resultLine(
  a: Analysis,
  lang: "en" | "hi",
  t: (key: string) => string,
): string {
  const outcome = outcomeOf(a);
  if (outcome === "healthy") return t("health.healthy");
  if (outcome === "disease" && a.prediction) {
    return lang === "hi" ? a.prediction.name_hi : a.prediction.name;
  }
  return analysisStatusLabel(a.status, lang);
}
