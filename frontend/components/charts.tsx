"use client";

// Small dependency-free charts for the admin dashboard. Single series only (one accent, no legend box:
// the title names the series). Marks: columns ≤24px with a 4px rounded data-end and 2px gaps, hairline
// grid, hover tooltip, and every chart has a table view, so nothing depends on seeing the colour.
import { useState } from "react";

const ACCENT = "var(--color-lime)";

function compact(n: number) {
  return new Intl.NumberFormat("en-IN", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

function niceMax(n: number) {
  if (n <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(n));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((x) => x >= n)!;
}

/** Columns over time (one per day), with a hover tooltip and a table view. */
export function DayColumns({ title, total, points, format = compact, tableLabel }: {
  title: string;
  total: string;
  points: { date: string; value: number }[];
  format?: (n: number) => string;
  tableLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 320, H = 120, PAD_L = 30, PAD_B = 18, PAD_T = 8;
  const max = niceMax(Math.max(...points.map((p) => p.value), 0));
  const slot = (W - PAD_L) / points.length;
  const bar = Math.max(2, Math.min(24, slot - 2));
  const y = (v: number) => PAD_T + (H - PAD_T - PAD_B) * (1 - v / max);
  const day = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  const h = hover === null ? null : points[hover];

  return (
    <figure className="glass rounded-2xl border border-white/15 p-4">
      <figcaption className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-muted">{title}</span>
        <span className="font-num text-xl font-semibold text-ink">{total}</span>
      </figcaption>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${title}: ${total}`}
          onMouseLeave={() => setHover(null)}>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={PAD_L} x2={W} y1={y(max * f)} y2={y(max * f)} stroke="rgb(255 255 255 / 0.12)" strokeWidth={1} />
              <text x={PAD_L - 4} y={y(max * f) + 3} textAnchor="end" fontSize="8" fill="var(--color-muted)">{format(max * f)}</text>
            </g>
          ))}
          {points.map((p, i) => {
            const x = PAD_L + i * slot + (slot - bar) / 2;
            const top = y(p.value);
            const height = H - PAD_B - top;
            const r = Math.min(4, bar / 2, height);
            return (
              <g key={p.date} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)}>
                {/* Hit target is the whole slot, taller than the mark. */}
                <rect x={PAD_L + i * slot} y={PAD_T} width={slot} height={H - PAD_T - PAD_B} fill="transparent" />
                {p.value > 0 && (
                  <path fill={ACCENT} opacity={hover === null || hover === i ? 1 : 0.45}
                    d={`M${x},${H - PAD_B} V${top + r} Q${x},${top} ${x + r},${top} H${x + bar - r} Q${x + bar},${top} ${x + bar},${top + r} V${H - PAD_B} Z`} />
                )}
              </g>
            );
          })}
          {/* First, middle and last dates; the ends anchor inward so they never clip. */}
          {[0, Math.floor(points.length / 2), points.length - 1].map((i, k) => (
            <text key={i} x={k === 0 ? PAD_L : k === 2 ? W : PAD_L + i * slot + slot / 2} y={H - 4}
              textAnchor={k === 0 ? "start" : k === 2 ? "end" : "middle"} fontSize="8" fill="var(--color-muted)">
              {day(points[i].date)}
            </text>
          ))}
        </svg>
        {h && (
          <div className="pointer-events-none absolute top-0 rounded-lg bg-[#0e3328] px-2 py-1 text-xs shadow-lg"
            style={{ left: `${((PAD_L + hover! * slot + slot / 2) / W) * 100}%`, transform: "translateX(-50%)" }}>
            <span className="text-muted">{day(h.date)}</span> <span className="font-semibold text-ink">{format(h.value)}</span>
          </div>
        )}
      </div>
      <details className="mt-1 text-xs text-muted">
        <summary className="cursor-pointer">{tableLabel}</summary>
        <table className="mt-1 w-full">
          <tbody>
            {points.filter((p) => p.value > 0).map((p) => (
              <tr key={p.date}><td>{day(p.date)}</td><td className="text-right text-text">{format(p.value)}</td></tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

/** Ranked horizontal bars: label left, value at the tip. The values are visible, so the bars are the table. */
export function RankBars({ title, items, empty, format = compact }: {
  title: string;
  items: { key: string; label: string; value: number }[];
  empty: string;
  format?: (n: number) => string;
}) {
  const max = Math.max(...items.map((i) => i.value), 1);
  return (
    <figure className="glass rounded-2xl border border-white/15 p-4">
      <figcaption className="mb-3 text-sm font-semibold text-muted">{title}</figcaption>
      {items.length === 0 ? <p className="text-sm text-muted">{empty}</p> : (
        <ul className="flex flex-col gap-2">
          {items.map((i) => (
            <li key={i.key} className="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-2 text-sm" title={`${i.label}: ${format(i.value)}`}>
              <span className="truncate">{i.label}</span>
              <span className="h-3 rounded-r-[4px]" style={{ width: `${Math.max(2, (i.value / max) * 100)}%`, background: ACCENT }} />
              <span className="font-num text-right font-semibold">{format(i.value)}</span>
            </li>
          ))}
        </ul>
      )}
    </figure>
  );
}
