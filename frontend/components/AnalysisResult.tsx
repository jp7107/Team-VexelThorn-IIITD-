"use client";

import type { ReactNode } from "react";
import { ReportView } from "@/components/ReportView";
import { ButtonLink } from "@/components/ui";
import type { Analysis } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

const KNOWN_QUALITY_REASONS = new Set(["blurry", "too_dark", "too_bright"]);

/** Coloured band at the top of the result: the one thing the farmer must read. */
function Verdict({ tone, title, children }: { tone: "alert" | "good" | "neutral" | "bad"; title: string; children?: ReactNode }) {
  const look = {
    alert: "bg-haldi-soft border-haldi",
    good: "bg-field-soft border-field",
    neutral: "bg-surface border-ink",
    bad: "bg-danger-soft border-danger",
  }[tone];
  return (
    <section className={`mb-5 rounded-2xl border-l-8 p-5 ${look}`} aria-live="polite">
      <h1 className="text-2xl font-bold leading-tight text-ink lg:text-3xl">{title}</h1>
      {children && <div className="mt-3 text-base">{children}</div>}
    </section>
  );
}

/**
 * Renders every status from the inference contract (plan §8.3, §12 paths A–C, G).
 * Uncertain results never assert a disease: alternatives are shown only as "possible".
 */
export function AnalysisResult({ analysis }: { analysis: Analysis }) {
  const { t, lang } = useI18n();
  const name = (n: { name: string | null; name_hi: string | null }) => (lang === "hi" ? n.name_hi : n.name) ?? "";
  // Never show 100%: a model score is not certainty.
  const pct = analysis.confidence === null ? null : Math.min(99, Math.round(analysis.confidence * 100));
  const p = analysis.prediction;

  let verdict: ReactNode;
  switch (analysis.status) {
    case "ok":
      verdict = p?.is_healthy ? (
        <Verdict tone="good" title={t("result.okHealthyTitle")}>
          {pct !== null && <p>{t("result.confidence", { pct })}</p>}
        </Verdict>
      ) : (
        <Verdict tone="alert" title={t("result.okDiseasedTitle", { name: p ? name(p) : "" })}>
          {pct !== null && <p>{t("result.confidence", { pct })}</p>}
        </Verdict>
      );
      break;
    case "uncertain":
      verdict = (
        <Verdict tone="neutral" title={t("result.uncertainTitle")}>
          <p className="mb-3">{t("result.uncertainBody")}</p>
          <h2 className="font-bold">{t("result.possible")}</h2>
          <ul className="list-disc pl-5">
            {analysis.top_k.map((k) => (
              <li key={k.class_code}>{name(k) || k.class_code}</li>
            ))}
          </ul>
        </Verdict>
      );
      break;
    case "unsupported":
      verdict = <Verdict tone="neutral" title={t("result.unsupportedTitle")}><p>{t("result.unsupportedBody")}</p></Verdict>;
      break;
    case "rejected_quality": {
      const reasons = analysis.quality.reasons.filter((r) => KNOWN_QUALITY_REASONS.has(r));
      verdict = (
        <Verdict tone="alert" title={t("result.qualityTitle")}>
          <ul className="list-disc pl-5">
            {(reasons.length ? reasons.map((r) => `result.quality_${r}`) : ["result.quality_other"]).map((key) => (
              <li key={key}>{t(key)}</li>
            ))}
          </ul>
        </Verdict>
      );
      break;
    }
    default:
      verdict = <Verdict tone="bad" title={t("result.errorTitle")}><p>{t("result.errorBody")}</p></Verdict>;
  }

  const diseased = analysis.status === "ok" && p && !p.is_healthy;
  const showRecheck = diseased || analysis.status === "uncertain";
  const { provenance, version } = analysis.model;

  return (
    <>
      {provenance === "mock" && (
        <p className="mb-6 rounded-xl bg-white/15 px-4 py-3 font-semibold text-white">{t("result.mockBanner")}</p>
      )}
      {verdict}
      {showRecheck && <p className="mb-4 text-base">{t("result.recheckAdded")}</p>}
      {(analysis.status === "ok" || analysis.status === "uncertain") && (
        <>
          <ReportView analysisId={analysis.id} />
          <p className="mb-4 glass rounded-xl border border-white/15 px-4 py-3 text-base">{t("result.disclaimer")}</p>
        </>
      )}
      {provenance !== "mock" && (
        <p className="mb-6 text-base text-muted">
          {provenance === "third_party_pretrained"
            ? t("result.modelThirdParty", { version })
            : t("result.modelInHouse", { version })}
        </p>
      )}
      <div className="flex flex-col gap-3">
        {(analysis.status === "ok" || analysis.status === "uncertain") && (
          <ButtonLink href={`/assistant?analysis=${analysis.id}`} variant="secondary">{t("result.askAbout")}</ButtonLink>
        )}
        <ButtonLink href="/farmer/diagnose">{t("result.checkAnother")}</ButtonLink>
        <ButtonLink href="/farmer" variant="secondary">{t("result.backHome")}</ButtonLink>
      </div>
    </>
  );
}
