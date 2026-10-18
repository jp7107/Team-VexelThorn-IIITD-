"use client";

import Link from "next/link";
import { Badge } from "@/components/ui";
import { MapPinIcon } from "@/components/icons";
import { cropLabel, inr, num } from "@/lib/format";
import type { Listing } from "@/lib/api";
import { ProduceArt, produceArtLabel } from "@/features/market/MarketArt";
import { RatingStars } from "@/features/market/RatingStars";
import { useMarketLabels } from "@/features/market/i18n";

/**
 * One marketplace card. The whole card is a real link (keyboard reachable, Enter opens it); the heading
 * inside carries the accessible name. No photo is implied: the tile is generated from the crop.
 */
export function ListingCard({ listing }: { listing: Listing }) {
  const { t, lang, unitLabel, statusLabel } = useMarketLabels();
  const l = listing;
  const price = l.price_per_unit
    ? `${inr(l.price_per_unit, lang)} / ${unitLabel(l.unit)}`
    : t("market.priceOnEnquiry");
  const ratingLabel =
    l.farmer.rating_avg !== null && l.farmer.rating_count > 0
      ? t("market.ratingLabel", { avg: l.farmer.rating_avg.toFixed(1) })
      : t("market.noRatings");

  return (
    <Link
      href={`/market/${l.id}`}
      className="kmx-listing-card"
      aria-label={`${l.title} — ${l.farmer.first_name}, ${l.district}, ${l.state}. ${price}`}
    >
      <span className="kmx-listing-art" role="img" aria-label={produceArtLabel(l.crop_code, lang)}>
        <ProduceArt crop={l.crop_code} height={92} glyphSize={38} />
        <span className="kmx-listing-status">
          <Badge tone={l.status === "open" ? "good" : l.status === "closed" ? "bad" : "neutral"}>
            {l.status === "hidden" ? statusLabel("hidden") : statusLabel(l.status)}
          </Badge>
        </span>
        {l.is_mine && <span className="kmx-listing-mine">{t("market.yourListing")}</span>}
      </span>

      <span className="kmx-listing-body">
        <span className="kmx-listing-kicker">
          {cropLabel(l.crop_code, lang)}
          <span className="kmx-dot" aria-hidden="true" />
          {t("market.quantityAvailable", { qty: num(l.quantity, lang), unit: unitLabel(l.unit) })}
        </span>
        <span className="kmx-listing-title">{l.title}</span>
        <span className="kmx-listing-price">{price}</span>

        <span className="kmx-listing-meta">
          <span className="kmx-farmer-name">{t("market.byFarmer", { name: l.farmer.first_name })}</span>
          <RatingStars
            avg={l.farmer.rating_avg}
            count={l.farmer.rating_count}
            label={ratingLabel}
            emptyLabel={t("market.noRatings")}
            size={11}
          />
        </span>
        <span className="kmx-listing-loc">
          <MapPinIcon size={12} />
          {t("market.location", { district: l.district, state: l.state })}
        </span>
      </span>
    </Link>
  );
}

export function ListingCardSkeleton() {
  return (
    <div className="kmx-listing-card kmx-skeleton-card" aria-hidden="true">
      <span className="km-skeleton" style={{ height: 92, display: "block", borderRadius: 0 }} />
      <span style={{ display: "grid", gap: 7, padding: 11 }}>
        <span className="km-skeleton" style={{ height: 10, width: "55%" }} />
        <span className="km-skeleton" style={{ height: 14, width: "85%" }} />
        <span className="km-skeleton" style={{ height: 13, width: "45%" }} />
        <span className="km-skeleton" style={{ height: 10, width: "70%" }} />
      </span>
    </div>
  );
}
