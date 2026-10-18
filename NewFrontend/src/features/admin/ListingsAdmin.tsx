"use client";

// Admin → Listings tab.
//   GET   /admin/listings?status=open|closed|hidden
//   PATCH /listings/{id} {status: "hidden" | "open"}   (admin moderation only)
// Closed listings belong to the farmer: the backend only lets an admin hide or unhide, so no control
// is offered for them.

import { useState } from "react";
import { CartIcon } from "@/components/icons";
import { Button, EmptyState, ErrorState, LoadingBlock, Panel } from "@/components/ui";
import { api, describeError, type Listing } from "@/lib/api";
import { useApi } from "@/lib/useApi";
import { cropLabel, inr, num, shortDate, statusTone } from "@/lib/format";
import { useContentI18n } from "@/features/content/ns";
import { Notice } from "@/features/admin/form";

type StatusFilter = "open" | "closed" | "hidden" | "";

export function ListingsAdmin() {
  const { t, lang } = useContentI18n();
  const [status, setStatus] = useState<StatusFilter>("");
  const { data, error, loading, reload } = useApi<Listing[]>(
    `/admin/listings${status ? `?status=${encodeURIComponent(status)}` : ""}`,
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  const rows = data ?? [];

  async function setListingStatus(l: Listing, next: "hidden" | "open") {
    setBusyId(l.id);
    setNotice(null);
    try {
      await api<Listing>(`/listings/${l.id}`, { method: "PATCH", body: { status: next } });
      setNotice({
        tone: "good",
        text:
          next === "hidden"
            ? t("admin.listings.hiddenNotice", { title: l.title })
            : t("admin.listings.unhiddenNotice", { title: l.title }),
      });
      reload();
    } catch (err) {
      setNotice({ tone: "bad", text: describeError(err) });
    } finally {
      setBusyId(null);
    }
  }

  function statusLabel(s: Listing["status"]): string {
    if (s === "open") return t("admin.listings.unhide") === "" ? s : t("dash.liveFootnote") === "" ? s : s;
    return s;
  }

  return (
    <Panel
      title={t("admin.listings.heading")}
      icon={<CartIcon size={17} style={{ color: "var(--km-green-700)" }} />}
      badge={
        <span className="km-badge neutral">
          {rows.length === 1
            ? t("admin.common.rowCountOne", { n: rows.length })
            : t("admin.common.rowCountMany", { n: rows.length })}
        </span>
      }
      action={
        <label className="ka-toolbar-meta" style={{ marginLeft: "auto", gap: 6, paddingBottom: 0 }}>
          <span className="km-caption">{t("admin.listings.statusLabel")}</span>
          <select
            className="km-select"
            value={status}
            onChange={(ev) => setStatus(ev.target.value as StatusFilter)}
            style={{ minHeight: 30, fontSize: 11.5, padding: "2px 8px", width: 140 }}
          >
            <option value="">{t("admin.listings.statusAll")}</option>
            <option value="open">{t("admin.common.publishedLabel") === "" ? "open" : "open"}</option>
            <option value="closed">{t("admin.listings.closedLabel")}</option>
            <option value="hidden">{t("admin.listings.hide")}</option>
          </select>
        </label>
      }
      bodyClassName=""
    >
      <p className="km-caption" style={{ marginBottom: 8 }}>
        {t("admin.listings.subtitle")}
      </p>

      {notice && <Notice tone={notice.tone}>{notice.text}</Notice>}

      {loading ? (
        <LoadingBlock lines={5} height={28} />
      ) : error ? (
        <ErrorState message={describeError(error)} onRetry={reload} />
      ) : rows.length === 0 ? (
        <EmptyState title={t("admin.listings.emptyTitle")} hint={t("admin.listings.emptyHint")} />
      ) : (
        <div className="km-scroll-x ka-table-wrap">
          <table className="km-table ka-table">
            <caption className="km-sr-only">{t("admin.listings.heading")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("admin.listings.colTitle")}</th>
                <th scope="col">{t("admin.listings.colFarmer")}</th>
                <th scope="col">{t("admin.listings.colQuantity")}</th>
                <th scope="col">{t("admin.listings.colPrice")}</th>
                <th scope="col">{t("admin.listings.colLocation")}</th>
                <th scope="col">{t("admin.listings.colStatus")}</th>
                <th scope="col">{t("admin.listings.colCreated")}</th>
                <th scope="col" style={{ textAlign: "right" }}>
                  {t("admin.common.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((l) => (
                <tr key={l.id}>
                  <td>
                    <div className="ka-cell-title">{l.title}</div>
                    <div className="ka-cell-sub">{cropLabel(l.crop_code, lang)}</div>
                  </td>
                  <td className="ka-cell-nowrap">{l.farmer.first_name}</td>
                  <td className="ka-cell-nowrap">
                    {num(l.quantity, lang)} {l.unit}
                  </td>
                  <td className="ka-cell-nowrap">
                    {l.price_per_unit ? (
                      `${inr(l.price_per_unit, lang)} / ${l.unit}`
                    ) : (
                      <span className="km-footnote">{t("admin.listings.onEnquiry")}</span>
                    )}
                  </td>
                  <td className="ka-cell-nowrap">
                    {l.district}, {l.state}
                  </td>
                  <td>
                    <span
                      className={`ka-status ${
                        l.status === "open" ? "good" : l.status === "hidden" ? "warn" : "bad"
                      }`}
                    >
                      {l.status === "open"
                        ? t("admin.common.publishedLabel")
                        : l.status === "hidden"
                          ? t("admin.listings.hide")
                          : t("admin.listings.closedLabel")}
                    </span>
                  </td>
                  <td className="ka-cell-nowrap">{shortDate(l.created_at, lang)}</td>
                  <td style={{ textAlign: "right" }}>
                    {l.status === "open" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busyId === l.id}
                        aria-label={t("admin.listings.hideAria", { title: l.title })}
                        onClick={() => void setListingStatus(l, "hidden")}
                      >
                        {busyId === l.id ? t("admin.listings.hiding") : t("admin.listings.hide")}
                      </Button>
                    )}
                    {l.status === "hidden" && (
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busyId === l.id}
                        aria-label={t("admin.listings.unhideAria", { title: l.title })}
                        onClick={() => void setListingStatus(l, "open")}
                      >
                        {busyId === l.id ? t("admin.listings.hiding") : t("admin.listings.unhide")}
                      </Button>
                    )}
                    {l.status === "closed" && <span className="km-footnote">{t("admin.listings.closedNote")}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}
