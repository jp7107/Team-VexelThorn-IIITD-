"use client";

// Results table for /prices. Every value shown is taken straight from the API rows; the only derived
// value is the trend, and only when two distinct arrival dates exist for the same market.

import { ArrowDownRightIcon, ArrowUpRightIcon, MinusIcon } from "@/components/icons";
import { Badge } from "@/components/ui";
import type { PriceRow } from "@/lib/api";
import { cropLabel, inr, shortDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { trendFor } from "./trend";

/** "Rs/quintal" → "quintal" for the compact unit suffix; unknown units are left as-is. */
function unitLabel(unit: string): string {
  return unit.replace(/^rs\s*\/\s*/i, "").trim() || unit;
}

function TrendCell({ row, rows }: { row: PriceRow; rows: PriceRow[] }) {
  const { t } = useI18n();
  const { change } = trendFor(row, rows);

  if (change === null) {
    return (
      <span className="km-prices-trend flat" title={t("prices.noEarlierPrice")}>
        <MinusIcon size={12} />
        <span aria-hidden="true">—</span>
        <span className="km-sr-only">{t("prices.noEarlierPrice")}</span>
      </span>
    );
  }

  const up = change >= 0;
  return (
    <span className={`km-prices-trend ${up ? "up" : "down"}`}>
      {up ? <ArrowUpRightIcon size={12} /> : <ArrowDownRightIcon size={12} />}
      <span aria-hidden="true">
        {up ? "+" : ""}
        {(change * 100).toFixed(1)}%
      </span>
      <span className="km-sr-only">
        {up ? t("prices.trendUp") : t("prices.trendDown")} {(Math.abs(change) * 100).toFixed(1)}%
      </span>
    </span>
  );
}

export function PriceResultsTable({
  rows,
  loading,
  updating,
}: {
  rows: PriceRow[];
  loading: boolean;
  updating: boolean;
}) {
  const { t, lang } = useI18n();

  if (loading) {
    return (
      <div className="km-prices-skeleton" aria-busy="true" aria-label={t("common.loading")}>
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="km-skeleton" style={{ height: 30 }} />
        ))}
      </div>
    );
  }

  return (
    <div className="km-scroll-x km-prices-scroll" tabIndex={0} role="region" aria-label={t("prices.resultsLabel")}>
      <table className={`km-table km-prices-table${updating ? " km-prices-updating" : ""}`} aria-busy={updating}>
        <caption className="km-sr-only">{t("prices.resultsCaption")}</caption>
        <thead>
          <tr>
            <th scope="col">{t("prices.colCrop")}</th>
            <th scope="col">{t("prices.colMarket")}</th>
            <th scope="col">{t("prices.colPrice")}</th>
            <th scope="col">{t("prices.colRange")}</th>
            <th scope="col">{t("prices.colArrival")}</th>
            <th scope="col">{t("prices.colTrend")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>
                <span className="km-prices-cell-main">{cropLabel(row.commodity.toLowerCase(), lang)}</span>
                {row.variety && row.variety.toLowerCase() !== row.commodity.toLowerCase() && (
                  <span className="km-prices-cell-sub">{row.variety}</span>
                )}
              </td>
              <td>
                <span className="km-prices-cell-main">{row.market}</span>
                <span className="km-prices-cell-sub">
                  {[row.district, row.state].filter(Boolean).join(", ")}
                </span>
              </td>
              <td>
                <span className="km-prices-price">{inr(row.modal_price, lang)}</span>
                <span className="km-prices-unit">
                  {t("prices.perUnit", { unit: unitLabel(row.unit) })}
                </span>
              </td>
              <td>
                <span className="km-prices-num">
                  {inr(row.min_price, lang)} – {inr(row.max_price, lang)}
                </span>
              </td>
              <td>
                <span className="km-prices-arrival">
                  <span>{shortDate(row.arrival_date, lang)}</span>
                  {row.stale && <Badge tone="neutral" title={t("prices.staleHint")}>{t("prices.stale")}</Badge>}
                </span>
              </td>
              <td>
                <TrendCell row={row} rows={rows} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
