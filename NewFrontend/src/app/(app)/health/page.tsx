"use client";

// Crop Health hub: the entry point for leaf checks. The dashboard already carries the full diagnosis panel,
// so this page stays a compact hub — scan CTA, latest result, recent list, and honest counts.

import Link from "next/link";
import { useMemo } from "react";
import { RequireRole } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { describeError, type Analysis } from "@/lib/api";
import { num } from "@/lib/format";import { Badge, ButtonLink, EmptyState, ErrorState, LoadingBlock, PageHeading, Panel } from "@/components/ui";
import {
  ArrowRightIcon,
  CameraIcon,
  CheckIcon,
  ClockIcon,
  LeafIcon,
  SparklesIcon,
} from "@/components/icons";
import { CheckRow, ResultSummary } from "@/features/health/components";
import { useHealthT } from "@/features/health/i18n";
import { outcomeOf } from "@/features/health/helpers";
import "@/features/health/health.css";

export default function HealthPage() {
  return <RequireRole roles={["farmer"]}>{() => <HealthHub />}</RequireRole>;
}

function HealthHub() {
  const { t, lang } = useHealthT();
  const checks = useApi<Analysis[]>("/me/analyses?limit=100");

  const latest = checks.data?.[0] ?? null;

  const counts = useMemo(() => {
    const rows = checks.data ?? [];
    return {
      total: rows.length,
      healthy: rows.filter((a) => outcomeOf(a) === "healthy").length,
      issues: rows.filter((a) => outcomeOf(a) === "disease").length,
    };
  }, [checks.data]);

  return (
    <div className="kmh-page">
      <PageHeading
        title={t("health.title")}
        subtitle={t("health.subtitle")}
        actions={
          <ButtonLink href="/health/diagnose">
            <CameraIcon size={15} /> {t("health.scanLeaf")}
          </ButtonLink>
        }
      />

      <div className="kmh-hub-grid">
        <Panel
          className="kmh-scan"
          bodyClassName="kmh-scan-body"
          title={t("health.scanLeaf")}
          icon={<LeafIcon size={18} style={{ color: "var(--km-green-700)" }} />}
          badge={<Badge tone="neutral">{t("health.formatsHint")}</Badge>}
        >
          <div className="kmh-scan-head">
            <span className="kmh-scan-tile" aria-hidden="true">
              <CameraIcon size={22} />
            </span>
            <div style={{ minWidth: 0 }}>
              <p className="kmh-scan-title">{t("health.scanSubtitle")}</p>
              <p className="km-caption" style={{ marginTop: 3 }}>
                {t("health.formatsHint")}
              </p>
            </div>
          </div>

          <div className="kmh-scan-actions">
            <ButtonLink href="/health/diagnose" size="sm">
              <CameraIcon size={14} /> {t("health.scanLeaf")}
            </ButtonLink>
            <ButtonLink href="/history" size="sm" variant="secondary">
              <ClockIcon size={14} /> {t("health.viewHistory")}
            </ButtonLink>
          </div>

          <div className="kmh-facts">
            {[
              { title: t("health.stepUpload"), body: t("health.stepUploadBody") },
              { title: t("health.stepModel"), body: t("health.stepModelBody") },
              { title: t("health.stepReport"), body: t("health.stepReportBody") },
            ].map((step, i) => (
              <div className="kmh-fact" key={step.title}>
                <span className="kmh-fact-num" aria-hidden="true">
                  {i + 1}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span className="kmh-fact-title">{step.title}</span>
                  <span className="kmh-fact-body">{step.body}</span>
                </span>
              </div>
            ))}
          </div>
        </Panel>

        <Panel
          title={t("health.latestCheck")}
          icon={<SparklesIcon size={18} style={{ color: "var(--km-green-700)" }} />}
          badge={
            checks.data ? (
              <Badge tone="neutral">{t("health.checksCount", { count: num(counts.total, lang) })}</Badge>
            ) : undefined
          }
        >
          {checks.loading ? (
            <LoadingBlock lines={5} height={16} />
          ) : checks.error ? (
            <ErrorState message={describeError(checks.error)} onRetry={checks.reload} />
          ) : !latest ? (
            <EmptyState
              title={t("health.latestEmpty")}
              hint={t("health.latestEmptyHint")}
              action={
                <ButtonLink href="/health/diagnose" size="sm">
                  <CameraIcon size={14} /> {t("health.scanLeaf")}
                </ButtonLink>
              }
            />
          ) : (
            <div className="kmh-stack-sm">
              <ResultSummary analysis={latest} />
              {counts.total > 0 && (
                <div className="kmh-counts">
                  <span className="kmh-status-chip">
                    <CheckIcon size={11} style={{ color: "var(--km-green-700)" }} />
                    {t("health.healthy")}: {num(counts.healthy, lang)}
                  </span>
                  <span className="kmh-status-chip">
                    <LeafIcon size={11} style={{ color: "var(--km-red-600)" }} />
                    {t("health.diseaseFound")}: {num(counts.issues, lang)}
                  </span>
                  <span className="kmh-status-chip">{t("health.allChecks")}: {num(counts.total, lang)}</span>
                </div>
              )}
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title={t("health.recentChecks")}
        icon={<ClockIcon size={18} style={{ color: "var(--km-green-700)" }} />}
        action={
          <Link href="/history" className="km-linkish" style={{ marginLeft: "auto" }}>
            {t("health.viewAllChecks")} <ArrowRightIcon size={12} />
          </Link>
        }
      >
        {checks.loading ? (
          <LoadingBlock lines={4} height={38} />
        ) : checks.error ? (
          <ErrorState message={describeError(checks.error)} onRetry={checks.reload} />
        ) : !checks.data || checks.data.length === 0 ? (
          <EmptyState title={t("health.recentEmpty")} hint={t("health.latestEmptyHint")} />
        ) : (
          <div className="kmh-check-list">
            {checks.data.slice(0, 5).map((a) => (
              <CheckRow key={a.id} analysis={a} />
            ))}
            {checks.data.length > 5 && (
              <Link href="/history" className="km-linkish" style={{ marginTop: 2 }}>
                {t("health.viewHistory")} <ArrowRightIcon size={12} />
              </Link>
            )}
          </div>
        )}
      </Panel>
    </div>
  );
}
