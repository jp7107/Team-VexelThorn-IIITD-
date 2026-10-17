"use client";

import { useEffect, useState } from "react";
import { api, type Report } from "@/lib/api";
import { useI18n } from "@/lib/i18n";

function Section({ title, items }: { title: string; items: string[] }) {
  if (!items.length) return null;
  return (
    <section className="mb-4">
      <h3 className="mb-1 text-lg font-extrabold text-ink">{title}</h3>
      <ul className="list-disc space-y-1 pl-5 text-lg">
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </section>
  );
}

/** Report for one analysis in the current language. The backend makes it once per language and caches it. */
export function ReportView({ analysisId }: { analysisId: string }) {
  const { t, lang } = useI18n();
  const [report, setReport] = useState<Report | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api<Report>(`/analyses/${analysisId}/report`, { method: "POST", body: { language: lang } })
      .then((r) => !cancelled && (setReport(r), setFailed(false)))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [analysisId, lang, attempt]);

  const current = report?.language === lang ? report : null;
  if (failed) {
    return (
      <p className="mb-5 rounded-xl bg-danger-soft px-4 py-3 text-lg font-semibold text-danger">
        {t("report.failed")}{" "}
        <button type="button" onClick={() => setAttempt((n) => n + 1)} className="min-h-11 underline">
          {t("report.retry")}
        </button>
      </p>
    );
  }
  if (!current) {
    return <p className="mb-5 text-lg text-muted" role="status">{t("report.loading")}</p>;
  }

  const c = current.content;
  return (
    <article className="mb-6 rounded-2xl border-2 border-line p-4" aria-labelledby="report-title">
      <h2 id="report-title" className="mb-2 text-2xl font-extrabold text-ink">{t("report.title")}</h2>
      <p className="mb-4 text-lg">{c.summary}</p>
      <Section title={t("report.symptoms")} items={c.symptoms_to_check} />
      <section className="mb-4">
        <h3 className="mb-1 text-lg font-extrabold text-ink">{t("report.meaning")}</h3>
        <p className="text-lg">{c.what_this_means}</p>
      </section>
      {c.recommended_actions.length > 0 && (
        <section className="mb-4">
          <h3 className="mb-2 text-lg font-extrabold text-ink">{t("report.actions")}</h3>
          <ul className="space-y-2">
            {c.recommended_actions.map((a) => (
              <li key={a.text} className="rounded-xl bg-surface px-3 py-2">
                <span className="block text-lg">{a.text}</span>
                <span className={`text-base font-semibold ${a.evidence_ref ? "text-field" : "text-muted"}`}>
                  {a.evidence_ref ? t("report.verified") : t("report.general")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <Section title={t("report.infoNeeded")} items={c.info_needed} />
      <Section title={t("report.safety")} items={c.safety_notes} />
      {c.sources.length > 0 && (
        <section className="mb-4">
          <h3 className="mb-1 text-lg font-extrabold text-ink">{t("report.sources")}</h3>
          <ul className="space-y-1 text-lg">
            {c.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="font-semibold text-ink underline">
                  {s.name}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
      <p className="text-base text-muted">
        {current.llm_status === "ok" ? t("report.aiWritten") : t("report.savedInfo")}
      </p>
    </article>
  );
}
