"use client";

// Updates — GET /updates?limit=50, already newest-first from the backend; we sort defensively so the
// promise holds even if the server order changes.

import Link from "next/link";
import { useMemo } from "react";
import { ArrowRightIcon, BellIcon } from "@/components/icons";
import { ExternalIcon } from "@/features/content/icons";
import { EmptyState, ErrorState, LoadingBlock, PageHeading, Panel } from "@/components/ui";
import { describeError, type FarmUpdate } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { shortDate } from "@/lib/format";
import { useContentI18n } from "@/features/content/ns";
import "./content.css";

export function UpdatesList() {
  const { t, lang } = useContentI18n();
  const { data, error, loading, reload } = useApi<FarmUpdate[]>("/updates?limit=50");

  const rows = useMemo(() => {
    return [...(data ?? [])].sort(
      (a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime(),
    );
  }, [data]);

  return (
    <div className="kc-page">
      <PageHeading
        title={t("content.updates.title")}
        subtitle={t("content.updates.subtitle")}
        actions={
          <Link href="/schemes" className="km-linkish">
            {t("content.updates.viewSchemes")} <ArrowRightIcon size={12} />
          </Link>
        }
      />

      <Panel
        title={t("content.updates.title")}
        icon={<BellIcon size={17} style={{ color: "var(--km-green-700)" }} />}
        badge={
          !loading && data && data.length > 0 ? (
            <span className="km-badge neutral">
              {rows.length === 1
                ? t("content.updates.countOne", { n: rows.length })
                : t("content.updates.countMany", { n: rows.length })}
            </span>
          ) : undefined
        }
      >
        {loading ? (
          <LoadingBlock lines={4} height={38} />
        ) : error ? (
          <ErrorState message={describeError(error)} onRetry={reload} />
        ) : rows.length === 0 ? (
          <EmptyState title={t("content.updates.emptyTitle")} hint={t("content.updates.emptyHint")} />
        ) : (
          <div className="kc-timeline" aria-live="polite">
            {rows.map((u) => (
              <article key={u.id} className="kc-update">
                <div className="kc-update-rail" aria-hidden="true">
                  <span className="kc-update-dot">
                    <BellIcon size={14} />
                  </span>
                </div>
                <div className="kc-update-body">
                  <span className="kc-update-date">
                    <time dateTime={u.published_at}>{shortDate(u.published_at, lang)}</time>
                  </span>
                  <h2 className="kc-update-title">{u.title}</h2>
                  <p className="kc-update-text">{u.body}</p>
                  {u.source_url && (
                    <a
                      className="kc-update-source"
                      href={u.source_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`${t("content.updates.sourceLink")} (${t("content.common.opensNewTab")})`}
                    >
                      <ExternalIcon size={13} />
                      {t("content.updates.sourceLink")}
                      <span className="km-sr-only"> — {t("content.common.opensNewTab")}</span>
                    </a>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
