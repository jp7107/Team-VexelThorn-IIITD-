"use client";

import type { ReactNode } from "react";
import { BotIcon, DatabaseIcon, LeafIcon, AlertIcon, CheckIcon } from "@/components/icons";
import { Badge, ErrorState, LoadingBlock, Panel } from "@/components/ui";
import { describeError, type Ready } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { useI18n } from "@/lib/i18n";

/**
 * GET /readyz is the only operational endpoint this page calls. It reports exactly what the backend knows:
 * database reachability, whether the classifier weights are loaded, and whether an LLM key is configured.
 * Nothing is inferred or upgraded to "all good" when a probe fails.
 */
export function StatusPanel() {
  const { t } = useI18n();
  const { data, error, loading, reload } = useApi<Ready>("/readyz", { timeoutMs: 12_000 });

  return (
    <Panel
      title={t("help.status.title")}
      icon={<LeafIcon size={17} />}
      action={
        <button type="button" className="km-linkish" onClick={reload} disabled={loading}>
          {loading ? t("help.status.checking") : t("help.status.refresh")}
        </button>
      }
    >
      <p className="km-caption" style={{ marginBottom: 10 }}>
        {t("help.status.hint")}
      </p>

      <div aria-live="polite" aria-busy={loading}>
        {loading && !data && <LoadingBlock lines={3} />}

        {!loading && error && !data && (
          <>
            <ErrorState message={describeError(error)} onRetry={reload} />
            <p className="km-footnote" style={{ marginTop: 8 }}>
              {t("help.status.offlineNote")}
            </p>
          </>
        )}

        {data && (
          <div className="km-status-list">
            <StatusRow
              icon={<DatabaseIcon size={16} />}
              label={t("help.status.db")}
              ok={data.db === "ok"}
              okText={t("help.status.dbOk")}
              failText={t("help.status.dbFail")}
              detail={t("help.status.dbDetail")}
            />
            <StatusRow
              icon={<LeafIcon size={16} />}
              label={t("help.status.model")}
              ok={data.model.loaded}
              okText={t("help.status.modelOk")}
              failText={t("help.status.modelFail")}
              detail={
                data.model.loaded
                  ? [data.model.version, data.model.arch].filter(Boolean).join(" · ") || t("help.status.noVersion")
                  : t("help.status.modelFailDetail")
              }
              extra={
                data.model.loaded && data.model.provenance === "mock" ? (
                  <Badge tone="demo">{t("help.status.mockModel")}</Badge>
                ) : undefined
              }
            />
            <StatusRow
              icon={<BotIcon size={16} />}
              label={t("help.status.llm")}
              ok={data.llm_configured}
              okText={t("help.status.llmOk")}
              failText={t("help.status.llmFail")}
              detail={data.llm_configured ? t("help.status.llmOkDetail") : t("help.status.llmOffDetail")}
            />
          </div>
        )}

        {!loading && !error && !data && <p className="km-caption">{t("help.status.noData")}</p>}
      </div>

      <p className="km-footnote" style={{ marginTop: 10 }}>
        {t("help.status.footnote")}
      </p>
    </Panel>
  );
}

function StatusRow({
  icon,
  label,
  ok,
  okText,
  failText,
  detail,
  extra,
}: {
  icon: ReactNode;
  label: string;
  ok: boolean;
  okText: string;
  failText: string;
  detail: string;
  extra?: ReactNode;
}) {
  return (
    <div className={`km-status-row${ok ? "" : " down"}`}>
      <span className="km-icon-tile km-status-icon" aria-hidden="true">
        {icon}
      </span>
      <div className="km-status-main">
        <div className="km-status-head">
          <span className="km-status-label">{label}</span>
          <Badge tone={ok ? "good" : "bad"}>
            {ok ? <CheckIcon size={11} /> : <AlertIcon size={11} />}
            {ok ? okText : failText}
          </Badge>
          {extra}
        </div>
        <p className="km-footnote">{detail}</p>
      </div>
    </div>
  );
}
