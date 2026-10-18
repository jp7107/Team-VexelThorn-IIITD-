"use client";

// Analysis detail. Shows only what the API verifies: prediction, policy thresholds, top-k, quality checks,
// model version/provenance and the timestamp. The API returns no image URL, so no photo is displayed.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { RequireRole } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { ApiError, api, describeError, type Analysis, type Report } from "@/lib/api";
import { Badge, ButtonLink, ChevronRow, ErrorState, LoadingBlock, PageHeading, Panel } from "@/components/ui";
import { BotIcon, ChevronRightIcon, ImageIcon, LeafIcon, ShieldIcon } from "@/components/icons";
import { ModelPanel, QualityPanel, ReportPanel, ResultSummary, TopKPanel } from "@/features/health/components";
import { useHealthT } from "@/features/health/i18n";
import { analysisCrop, dateTime } from "@/features/health/helpers";
import "@/features/health/health.css";

export default function AnalysisPage() {
  return <RequireRole roles={["farmer"]}>{() => <AnalysisDetail />}</RequireRole>;
}

function AnalysisDetail() {
  const { t, lang } = useHealthT();
  const params = useParams<{ id: string | string[] }>();
  const raw = params?.id;
  const id = Array.isArray(raw) ? raw[0] : raw;
  const analysis = useApi<Analysis>(id ? `/analyses/${encodeURIComponent(id)}` : null);
  const report = useReport(id);

  return (
    <div className="kmh-page">
      <nav aria-label="Breadcrumb" className="kmh-crumb">
        <Link href="/health">{t("health.title")}</Link>
        <ChevronRightIcon size={11} aria-hidden="true" />
        <Link href="/history">{t("health.historyTitle")}</Link>
        <ChevronRightIcon size={11} aria-hidden="true" />
        <span aria-current="page">{t("health.analysisTitle")}</span>
      </nav>

      <PageHeading
        title={t("health.analysisTitle")}
        subtitle={
          analysis.data
            ? `${analysisCrop(analysis.data, lang)} · ${dateTime(analysis.data.created_at, lang)}`
            : undefined
        }
        actions={
          <ButtonLink href="/health/diagnose" size="sm" variant="secondary">
            {t("health.scanAnother")}
          </ButtonLink>
        }
      />

      {analysis.loading ? (
        <Panel title={t("health.analysisTitle")} icon={<LeafIcon size={18} style={{ color: "var(--km-green-700)" }} />}>
          <LoadingBlock lines={6} height={18} />
        </Panel>
      ) : analysis.error ? (
        <Panel>
          <ErrorState
            message={
              analysis.error.status === 404
                ? t("health.analysisMissing")
                : describeError(analysis.error)
            }
            onRetry={analysis.error.status === 404 ? undefined : analysis.reload}
          />
        </Panel>
      ) : analysis.data ? (
        <div className="kmh-detail-grid">
          <div className="kmh-detail-main">
            <Panel
              title={t("health.resultTitle")}
              icon={<LeafIcon size={18} style={{ color: "var(--km-green-700)" }} />}
              badge={<Badge tone="guidance">{t("health.notADiagnosis")}</Badge>}
            >
              <ResultSummary analysis={analysis.data} showImageNote />
            </Panel>

            <TopKPanel analysis={analysis.data} />

            <ReportPanel
              language={report.language}
              report={report.report}
              loading={report.loading}
              error={report.error}
              generating={report.generating}
              onGenerate={(lng) => void report.switchLanguage(lng)}
              onSwitchLanguage={(lng) => void report.load(lng)}
            />
          </div>

          <div className="kmh-detail-side">
            <QualityPanel analysis={analysis.data} />
            <ModelPanel analysis={analysis.data} />

            <Panel
              title={t("health.photoUnavailable")}
              icon={<ImageIcon size={17} style={{ color: "var(--km-muted)" }} />}
            >
              <p className="km-caption">{t("health.noImage")}</p>
            </Panel>

            <ChevronRow
              href={`/assistant?analysis_id=${encodeURIComponent(analysis.data.id)}`}
              icon={<BotIcon size={15} />}
              title={t("health.askAssistant")}
              subtitle={`${t("health.modelVersion")}: ${analysis.data.model.version}`}
              tint="#eaf0fd"
              iconColor="var(--km-blue-600)"
            />

            <p className="km-footnote" style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
              <ShieldIcon size={12} style={{ flex: "none", marginTop: 1 }} />
              <span>{t("health.reportSafety")}</span>
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ---------------- report state ---------------- */

function isNotFound(e: unknown): boolean {
  return e instanceof ApiError && e.status === 404;
}

function useReport(id: string | undefined) {
  const { lang } = useHealthT();
  const [language, setLanguage] = useState<"en" | "hi">(lang);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Read-only lookup: never generates on page load. A 404 simply means "not generated yet".
  const load = useCallback(
    async (lng: "en" | "hi") => {
      if (!id) return;
      setLanguage(lng);
      setLoading(true);
      setError(null);
      try {
        const existing = await api<Report>(`/analyses/${encodeURIComponent(id)}/report?language=${lng}`);
        if (alive.current) setReport(existing);
      } catch (e) {
        if (isNotFound(e)) {
          if (alive.current) setReport(null);
        } else if (alive.current) {
          setError(describeError(e));
        }
      } finally {
        if (alive.current) setLoading(false);
      }
    },
    [id],
  );

  // On first render, follow the active UI language so the panel matches the page.
  useEffect(() => {
    void load(lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, lang, load]);

  const generate = useCallback(
    async (lng: "en" | "hi") => {
      if (!id) return;
      setLanguage(lng);
      setGenerating(true);
      setError(null);
      try {
        // Idempotent: 201 on first creation, 200 when a report already exists.
        const created = await api<Report>(`/analyses/${encodeURIComponent(id)}/report`, {
          method: "POST",
          body: { language: lng },
          timeoutMs: 45_000,
        });
        if (alive.current) setReport(created);
      } catch (e) {
        if (alive.current) setError(describeError(e));
      } finally {
        if (alive.current) setGenerating(false);
      }
    },
    [id],
  );

  // Switching language: try the read path first, and only generate when nothing exists in that language.
  const switchLanguage = useCallback(
    async (lng: "en" | "hi") => {
      if (!id) return;
      setLanguage(lng);
      setLoading(true);
      setError(null);
      try {
        const existing = await api<Report>(`/analyses/${encodeURIComponent(id)}/report?language=${lng}`);
        if (alive.current) setReport(existing);
      } catch (e) {
        if (!isNotFound(e)) {
          if (alive.current) setError(describeError(e));
          return;
        }
        await generate(lng);
      } finally {
        if (alive.current) setLoading(false);
      }
    },
    [id, generate],
  );

  return { language, report, loading, generating, error, load, switchLanguage };
}
