"use client";

// Directional change is computed ONLY from rows the API actually returned. The rule: for the same
// commodity + market, there must be at least two distinct arrival dates before any trend is shown.
// When there is only one date (the common case for a single fetch), we show "—" and say why.

import type { PriceRow } from "@/lib/api";

export type RowTrend = {
  /** Fractional change (0.032 = +3.2 %), or null when there is nothing honest to compare. */
  change: number | null;
};

/** Distinct arrival dates for a commodity+market, newest first (string compare is safe: YYYY-MM-DD). */
function datesFor(rows: PriceRow[], market: string): string[] {
  const dates = new Set<string>();
  for (const r of rows) if (r.market === market) dates.add(r.arrival_date);
  return [...dates].sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
}

/**
 * Previous comparable price for `row`: a row in the same commodity+market on an earlier arrival_date,
 * preferring the same variety. The source rows already share a commodity (one request per commodity).
 */
function previousPrice(rows: PriceRow[], market: string, before: string, variety: string): number | null {
  const candidates = rows.filter((r) => r.market === market && r.arrival_date < before);
  if (candidates.length === 0) return null;
  const latestEarlier = candidates.reduce((m, r) => (r.arrival_date > m ? r.arrival_date : m), candidates[0].arrival_date);
  const sameDay = candidates.filter((r) => r.arrival_date === latestEarlier);
  const sameVariety = sameDay.filter((r) => r.variety === variety);
  const pickFrom = sameVariety.length > 0 ? sameVariety : sameDay;
  if (pickFrom.length !== 1) return null; // ambiguous — do not guess which market price to use
  const n = Number(pickFrom[0].modal_price);
  return Number.isFinite(n) && n !== 0 ? n : null;
}

export function trendFor(row: PriceRow, rows: PriceRow[]): RowTrend {
  const dates = datesFor(rows, row.market);
  // Only the most recent arrival date carries a comparison; older rows have no honest predecessor.
  if (dates.length < 2 || row.arrival_date !== dates[0]) return { change: null };
  const prev = previousPrice(rows, row.market, row.arrival_date, row.variety);
  if (prev === null) return { change: null };
  const now = Number(row.modal_price);
  if (!Number.isFinite(now)) return { change: null };
  const change = (now - prev) / prev;
  return { change: Number.isFinite(change) ? change : null };
}
