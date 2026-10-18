"use client";

// Presentational building blocks shared by the health hub, result page and history.
import Link from "next/link";
import type { ReactNode } from "react";
import { analysisStatusLabel, cropLabel, pct } from "@/lib/format";
import type { Analysis, Report } from "@/lib/api";
import { Badge, Button, ButtonLink, DataRow, Divider, Panel } from "@/components/ui";
import {
  AlertIcon,
  ArrowRightIcon,
  CameraIcon,
  CheckIcon,
  ClockIcon,
  FileTextIcon,
  InfoIcon,
  LeafIcon,
  ShieldIcon,
} from "@/components/icons";
import { useHealthT } from "./i18n";
import {
  analysisCrop,
  dateTime,
  outcomeOf,
  outcomeTone,
  provenanceKey,
  rankedTopK,
  type Outcome,
} from "./helpers";

/* ---------- status ---------- */

const OUTCOME_ICONS: Record<Outcome, ReactNode> = {
  healthy: <CheckIcon size={13} />,
  disease: <LeafIcon size={13} />,
  uncertain: <AlertIcon size={13} />,
  unsupported: <InfoIcon size={13} />,
  rejected: <CameraIcon size={13} />,
  error: <AlertIcon size={13} />,
};

export function outcomeLabel(a: Analysis, lang: "en" | "hi", t: (k: string) => string): string {
  const outcome = outcomeOf(a);
  if (outcome === "healthy") return t("health.healthy");
  if (outcome === "disease") return t("health.diseaseFound");
  return analysisStatusLabel(a.status, lang);
}

/** Status pill with an icon, so colour is never the only signal. */
export function StatusBadge({ analysis }: { analysis: Analysis }) {
  const { t, lang } = useHealthT();
  const outcome = outcomeOf(analysis);
  return (
    <Badge tone={outcomeTone(outcome)}>
      <span aria-hidden="true" style={{ display: "inline-flex" }}>
        {OUTCOME_ICONS[outcome]}
      </span>
      {outcomeLabel(analysis, lang, t)}
    </Badge>
  );
}

/* ---------- confidence ---------- */

export function ConfidenceMeter({
  value,
  accept,
  floor,
  label,
  size = "md",
}: {
  value: number | null;
  accept?: number | null;
  floor?: number | null;
  label: string;
  size?: "md" | "lg";
}) {
  const p = value === null ? 0 : Math.max(0, Math.min(1, value));
  const shown = Math.round(p * 100);
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span className="km-caption">{label}</span>
        <strong style={{ fontSize: size === "lg" ? 16 : 12 }}>{value === null ? "—" : pct(value)}</strong>
      </div>
      <div
        className={`kmh-meter${size === "lg" ? " lg" : ""}`}
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={shown}
        aria-valuetext={value === null ? undefined : pct(value)}
        aria-label={label}
      >
        <div className="kmh-meter-fill" style={{ width: `${shown}%` }} />
        {accept !== null && accept !== undefined && (
          <span className="kmh-meter-mark" style={{ left: `${Math.round(accept * 100)}%` }} aria-hidden="true" />
        )}
        {floor !== null && floor !== undefined && (
          <span className="kmh-meter-mark floor" style={{ left: `${Math.round(floor * 100)}%` }} aria-hidden="true" />
        )}
      </div>
    </div>
  );
}

/* ---------- disclaimers ---------- */

export function AiNotice({ compact = false }: { compact?: boolean }) {
  const { t } = useHealthT();
  return (
    <p className={`kmh-warning${compact ? " compact" : ""}`}>
      <AlertIcon size={14} style={{ flex: "none" }} />
      <span>{t("health.notADiagnosis")}</span>
    </p>
  );
}

/* ---------- result hero (hub + detail) ---------- */

export function ResultSummary({
  analysis,
  showImageNote = false,
}: {
  analysis: Analysis;
  showImageNote?: boolean;
}) {
  const { t, lang } = useHealthT();
  const outcome = outcomeOf(analysis);
  const isHealthy = outcome === "healthy";
  const title =
    outcome === "healthy"
      ? t("health.healthy")
      : outcome === "disease"
        ? `${t("health.diseaseFound")} · ${
            analysis.prediction
              ? lang === "hi"
                ? analysis.prediction.name_hi
                : analysis.prediction.name
              : "—"
          }`
        : t(`health.status${cap(outcome)}Title`);

  return (
    <div className="kmh-result" data-kind={outcome}>
      <div className="kmh-result-head">
        <span className="kmh-result-tile" aria-hidden="true">
          <LeafIcon size={18} />
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3 className="kmh-result-title">{title}</h3>
          <p className="km-caption" style={{ marginTop: 2 }}>
            {analysisCrop(analysis, lang)} · {t("health.checkedOn", { when: dateTime(analysis.created_at, lang) })}
          </p>
        </div>
        <StatusBadge analysis={analysis} />
      </div>

      <div className="kmh-result-body">
        <ConfidenceMeter
          value={analysis.confidence}
          accept={analysis.policy.accept_threshold}
          floor={analysis.policy.uncertain_floor}
          label={t("health.confidence")}
          size="lg"
        />

        {isHealthy && (
          <p className="kmh-hint good">
            <CheckIcon size={14} style={{ flex: "none" }} />
            <span>{t("health.healthyPrediction")}</span>
          </p>
        )}
        {outcome === "uncertain" && <p className="kmh-hint">{t("health.statusUncertainHint")}</p>}
        {outcome === "unsupported" && <p className="kmh-hint">{t("health.statusUnsupportedHint")}</p>}
        {outcome === "rejected" && <p className="kmh-hint">{t("health.statusRejectedHint")}</p>}
        {outcome === "error" && <p className="kmh-hint">{t("health.statusErrorHint")}</p>}

        <AiNotice />

        {showImageNote && <p className="km-footnote">{t("health.noImage")}</p>}

        <div className="kmh-actions">
          <ButtonLink href={`/analyses/${analysis.id}`} size="sm">
            {t("health.openFullResult")} <ArrowRightIcon size={13} />
          </ButtonLink>
          <ButtonLink href="/health/diagnose" size="sm" variant="secondary">
            <CameraIcon size={13} /> {t("health.scanAnother")}
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/* ---------- top-k ---------- */

export function TopKPanel({ analysis }: { analysis: Analysis }) {
  const { t, lang } = useHealthT();
  const rows = rankedTopK(analysis);
  return (
    <Panel
      title={t("health.topK")}
      icon={<LeafIcon size={17} style={{ color: "var(--km-green-700)" }} />}
      bodyClassName="kmh-stack-sm"
    >
      {rows.length === 0 ? (
        <p className="km-caption">{t("health.topKEmpty")}</p>
      ) : (
        <>
          <ol className="kmh-topk">
            {rows.map((row, i) => {
              const name = (lang === "hi" ? row.name_hi : row.name) ?? row.class_code;
              return (
                <li key={row.class_code} className="kmh-topk-row">
                  <span className="kmh-rank" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span className="kmh-topk-name">
                    <span className="kmh-topk-label">{name}</span>
                    <span className="km-footnote">{row.class_code}</span>
                    <span className="kmh-topk-track" aria-hidden="true">
                      <span style={{ width: `${Math.max(1, Math.round(row.p * 100))}%` }} />
                    </span>
                  </span>
                  <strong className="kmh-topk-p">{pct(row.p, 1)}</strong>
                </li>
              );
            })}
          </ol>
          <p className="km-footnote">{t("health.topKHint")}</p>
        </>
      )}
    </Panel>
  );
}

/* ---------- quality ---------- */

export function QualityPanel({ analysis }: { analysis: Analysis }) {
  const { t } = useHealthT();
  const q = analysis.quality;
  return (
    <Panel
      title={t("health.quality")}
      icon={<CameraIcon size={17} style={{ color: "var(--km-muted)" }} />}
      badge={
        <Badge tone={q.passed ? "good" : "bad"}>
          {q.passed ? t("health.qualityPassed") : t("health.qualityFailed")}
        </Badge>
      }
    >
      <div>
        <DataRow
          label={t("health.qualityBlur")}
          value={q.blur_var === null ? "—" : q.blur_var.toFixed(2)}
        />
        <DataRow
          label={t("health.qualityBrightness")}
          value={q.brightness === null ? "—" : q.brightness.toFixed(3)}
        />
      </div>
      <Divider />
      <p className="km-label" style={{ display: "block", marginBottom: 4 }}>
        {t("health.qualityReasons")}
      </p>
      {q.reasons.length === 0 ? (
        <p className="km-caption">{t("health.qualityNoReasons")}</p>
      ) : (
        <ul className="kmh-reasons">
          {q.reasons.map((reason) => (
            <li key={reason}>
              <AlertIcon size={12} style={{ flex: "none", color: "var(--km-red-700)" }} />
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/* ---------- model & record ---------- */

export function ModelPanel({ analysis }: { analysis: Analysis }) {
  const { t, lang } = useHealthT();
  const provenanceCopy = {
    trained: t("health.provenanceTrained"),
    thirdParty: t("health.provenanceThirdParty"),
    mock: t("health.provenanceMock"),
  };
  return (
    <Panel
      title={t("health.modelRecord")}
      icon={<ShieldIcon size={17} style={{ color: "var(--km-muted)" }} />}
    >
      <div>
        <DataRow label={t("health.modelVersion")} value={<code className="kmh-code">{analysis.model.version}</code>} />
        <DataRow label={t("health.modelProvenance")} value={provenanceCopy[provenanceKey(analysis)]} />
        <DataRow label={t("health.createdAt")} value={dateTime(analysis.created_at, lang)} />
        <DataRow label={t("health.claimedCrop")} value={cropLabel(analysis.crop_code_claimed, lang)} />
        <DataRow label={t("health.linkedCrop")} value={analysis.farm_crop_id ? shortId(analysis.farm_crop_id) : t("health.unlinked")} />
        <DataRow label={t("health.latency")} value={t("health.latencyValue", { ms: analysis.latency_ms })} />
        <DataRow
          label={t("health.acceptThreshold")}
          value={analysis.policy.accept_threshold === null ? "—" : pct(analysis.policy.accept_threshold)}
        />
        <DataRow
          label={t("health.uncertainFloor")}
          value={analysis.policy.uncertain_floor === null ? "—" : pct(analysis.policy.uncertain_floor)}
        />
      </div>
    </Panel>
  );
}

function shortId(id: string): string {
  return id.length > 10 ? `${id.slice(0, 8)}…` : id;
}

/* ---------- report ---------- */

export function ReportPanel({
  language,
  report,
  loading,
  error,
  generating,
  onGenerate,
  onSwitchLanguage,
}: {
  language: "en" | "hi";
  report: Report | null;
  loading: boolean;
  error: string | null;
  generating: boolean;
  onGenerate: (lang: "en" | "hi") => void;
  onSwitchLanguage: (lang: "en" | "hi") => void;
}) {
  const { t, lang } = useHealthT();

  return (
    <Panel
      title={t("health.report")}
      icon={<FileTextIcon size={17} style={{ color: "var(--km-green-700)" }} />}
      badge={
        <div className="kmh-lang-switch" role="group" aria-label={t("health.reportLanguage")}>
          <button
            type="button"
            lang="en"
            aria-pressed={language === "en"}
            className={language === "en" ? "active" : ""}
            onClick={() => onSwitchLanguage("en")}
            disabled={loading || generating}
          >
            English
          </button>
          <button
            type="button"
            lang="hi"
            aria-pressed={language === "hi"}
            className={language === "hi" ? "active" : ""}
            onClick={() => onSwitchLanguage("hi")}
            disabled={loading || generating}
          >
            हिन्दी
          </button>
        </div>
      }
    >
      {loading || generating ? (
        <div aria-live="polite" className="kmh-stack-sm">
          <p className="km-caption" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <ClockIcon size={13} /> {generating ? t("health.generating") : t("common.loading")}
          </p>
          <div className="km-skeleton" style={{ height: 14 }} />
          <div className="km-skeleton" style={{ height: 14, width: "82%" }} />
          <div className="km-skeleton" style={{ height: 14, width: "64%" }} />
        </div>
      ) : error ? (
        <div className="kmh-stack-sm">
          <div className="km-state error" role="alert">
            <span>{error}</span>
          </div>
          <Button size="sm" onClick={() => onGenerate(language)}>
            {t("health.generateReport")}
          </Button>
        </div>
      ) : !report ? (
        <div className="kmh-stack-sm">
          <p className="km-caption">{t("health.reportIntro")}</p>
          <Button size="sm" onClick={() => onGenerate(language)}>
            <FileTextIcon size={14} /> {t("health.generateReport")}
          </Button>
        </div>
      ) : (
        <ReportContent report={report} lang={lang} />
      )}
    </Panel>
  );
}

function ReportContent({ report, lang }: { report: Report; lang: "en" | "hi" }) {
  const { t } = useHealthT();
  const c = report.content;
  return (
    <article className="kmh-report" aria-live="polite">
      <header className="kmh-report-head">
        <div>
          <h3 className="kmh-report-summary">{c.summary}</h3>
          <p className="km-caption">
            {report.llm_status === "ok" ? t("health.reportLlm") : t("health.reportFallback")}
          </p>
        </div>
        <Badge tone="neutral">{report.language === "hi" ? "हिन्दी" : "English"}</Badge>
      </header>

      {c.what_this_means && (
        <section>
          <h4 className="kmh-report-h">{t("health.reportMeaning")}</h4>
          <p className="kmh-prose">{c.what_this_means}</p>
        </section>
      )}

      {c.symptoms_to_check.length > 0 && (
        <section>
          <h4 className="kmh-report-h">{t("health.reportSymptoms")}</h4>
          <ul className="kmh-bullets">
            {c.symptoms_to_check.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      {c.recommended_actions.length > 0 && (
        <section>
          <h4 className="kmh-report-h">{t("health.reportActions")}</h4>
          <ol className="kmh-bullets">
            {c.recommended_actions.map((a, i) => (
              <li key={`${i}-${a.text}`}>
                {a.text}
                {a.evidence_ref && <span className="km-footnote"> · {a.evidence_ref}</span>}
              </li>
            ))}
          </ol>
        </section>
      )}

      {c.info_needed.length > 0 && (
        <section>
          <h4 className="kmh-report-h">{t("health.reportInfoNeeded")}</h4>
          <ul className="kmh-bullets">
            {c.info_needed.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      {c.safety_notes.length > 0 && (
        <section className="kmh-safety">
          <h4 className="kmh-report-h">{t("health.reportSafety")}</h4>
          <ul className="kmh-bullets">
            {c.safety_notes.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </section>
      )}

      {c.consult_expert && (
        <p className="kmh-hint">
          <ShieldIcon size={14} style={{ flex: "none" }} />
          <span>{t("health.reportConsult")}</span>
        </p>
      )}

      {c.sources.length > 0 && (
        <section>
          <h4 className="kmh-report-h">{t("health.reportSources")}</h4>
          <ul className="kmh-sources">
            {c.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noreferrer noopener" className="km-linkish">
                  {s.name}
                </a>
                <span className="km-footnote kmh-break">{s.url}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="km-footnote">
        {t("health.reportGenerated", { when: dateTime(report.created_at, lang) })}
        {report.llm_model ? ` · ${report.llm_model}` : ""}
      </p>
    </article>
  );
}

/* ---------- small empty helper ---------- */

export function HealthEmptyHint({ title, hint, cta }: { title: string; hint: string; cta?: ReactNode }) {
  return (
    <div className="km-state">
      <span className="km-state-title">{title}</span>
      <span>{hint}</span>
      {cta && <div style={{ marginTop: 4 }}>{cta}</div>}
    </div>
  );
}

/** Linking helper reused by the hub rows. */
export function CheckRow({ analysis }: { analysis: Analysis }) {
  const { t, lang } = useHealthT();
  const outcome = outcomeOf(analysis);
  return (
    <Link href={`/analyses/${analysis.id}`} className="kmh-check-row">
      <span className="kmh-check-dot" data-kind={outcome} aria-hidden="true" />
      <span style={{ minWidth: 0, flex: 1 }}>
        <span className="kmh-check-title">
          {outcome === "healthy"
            ? t("health.healthy")
            : outcome === "disease" && analysis.prediction
              ? analysis.prediction.name
              : analysisStatusLabel(analysis.status, lang)}
        </span>
        <span className="km-caption" style={{ display: "block", marginTop: 1 }}>
          {analysisCrop(analysis, lang)} · {dateTime(analysis.created_at, lang)}
          {analysis.confidence !== null ? ` · ${pct(analysis.confidence)}` : ""}
        </span>
      </span>
      <StatusBadge analysis={analysis} />
    </Link>
  );
}
