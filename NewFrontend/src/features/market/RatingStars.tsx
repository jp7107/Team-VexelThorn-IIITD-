"use client";

import { StarIcon } from "@/components/icons";

/** Five-star display for a farmer's average. Color is never the only signal: value + count are in text. */
export function RatingStars({
  avg,
  count,
  size = 12,
  label,
  emptyLabel,
}: {
  avg: number | null;
  count: number;
  size?: number;
  label: string;
  emptyLabel: string;
}) {
  if (avg === null || count === 0) {
    return <span className="kmx-rating-empty">{emptyLabel}</span>;
  }
  const rounded = Math.round(avg * 2) / 2;
  return (
    <span className="kmx-rating" role="img" aria-label={label} title={label}>
      <span className="kmx-rating-stars" aria-hidden="true">
        {[1, 2, 3, 4, 5].map((i) => (
          <StarIcon key={i} size={size} filled={rounded >= i} style={rounded >= i - 0.5 && rounded < i ? { opacity: 0.55 } : undefined} />
        ))}
      </span>
      <span className="kmx-rating-value" aria-hidden="true">
        {avg.toFixed(1)}
      </span>
      <span className="kmx-rating-count" aria-hidden="true">
        ({count})
      </span>
    </span>
  );
}
