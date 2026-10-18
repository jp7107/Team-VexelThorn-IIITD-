"use client";

import Link from "next/link";
import { CROP_ICONS, SproutIcon } from "@/components/icons";
import type { Listing, Unit } from "@/lib/api";
import { cropLabel, useCrops } from "@/lib/catalogue";
import { useI18n } from "@/lib/i18n";
import { STATES } from "@/lib/places";

const QUINTAL_KG: Record<Unit, number | null> = { kg: 1, quintal: 100, tonne: 1000, dozen: null };

/** Plan §14.1: a "bulk" badge from one quintal up. Dozens have no weight, so never bulk. */
export function isBulk(l: Pick<Listing, "quantity" | "unit">): boolean {
  const kg = QUINTAL_KG[l.unit];
  return kg !== null && Number(l.quantity) * kg >= 100;
}

export function useFormat() {
  const { t, lang } = useI18n();
  const crops = useCrops();
  const num = new Intl.NumberFormat(lang === "hi" ? "hi-IN" : "en-IN", { maximumFractionDigits: 2 });
  return {
    qty: (q: string | number, unit: Unit) => `${num.format(Number(q))} ${t(`units.${unit}`)}`,
    price: (p: string | null, unit: Unit) =>
      p === null ? t("market.priceOnRequest") : `₹${num.format(Number(p))} ${t("market.perUnit", { unit: t(`units.${unit}`) })}`,
    // Catalogue name first (admins can add crops), then the built-in translations.
    crop: (code: string) => (crops?.some((c) => c.code === code) ? cropLabel(crops, code, lang)
      : code in CROP_ICONS ? t(`crops.${code}`) : code),
    money: (x: string | number) => `₹${new Intl.NumberFormat(lang === "hi" ? "hi-IN" : "en-IN",
      { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(x))}`,
    state: (s: string) => (lang === "hi" ? STATES.find((x) => x.value === s)?.hi ?? s : s),
  };
}

export function CropIcon({ code, className }: { code: string; className?: string }) {
  const Icon = CROP_ICONS[code] ?? SproutIcon;
  return <Icon className={className} />;
}

export function StatusPill({ status }: { status: string }) {
  const { t } = useI18n();
  const look = ["accepted", "open", "paid", "dispatched", "delivered"].includes(status) ? "bg-field-soft text-field"
    : ["pending", "awaiting_payment", "payment_submitted"].includes(status) ? "bg-haldi-soft text-ink"
      : "bg-surface text-muted";
  return <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${look}`}>{t(`statuses.${status}`)}</span>;
}

export function ListingCard({ l }: { l: Listing }) {
  const { t } = useI18n();
  const f = useFormat();
  return (
    <Link href={`/market/${l.id}`} className="flex gap-4 glass rounded-2xl border border-white/15 bg-white/10 p-4">
      <CropIcon code={l.crop_code} className="size-12 shrink-0 text-field" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-base font-bold text-ink">{l.title}</span>
          {isBulk(l) && <span className="rounded-full bg-haldi px-2 text-base font-bold text-ink-strong">{t("market.bulk")}</span>}
        </span>
        <span className="block text-base">{f.qty(l.quantity, l.unit)} · {f.price(l.price_per_unit, l.unit)}</span>
        <span className="block text-base text-muted">
          {t("market.location", { district: l.district, state: f.state(l.state) })} · {t("market.by", { name: l.farmer.first_name })}
          {" · "}
          {l.farmer.rating_count ? t("market.rating", { avg: l.farmer.rating_avg ?? 0, count: l.farmer.rating_count }) : t("market.noRating")}
        </span>
      </span>
    </Link>
  );
}

export function Stars({ n }: { n: number }) {
  const { t } = useI18n();
  return (
    <span role="img" aria-label={t("rate.star", { n })} className="text-haldi">
      {"★".repeat(n)}<span className="text-line">{"★".repeat(5 - n)}</span>
    </span>
  );
}
