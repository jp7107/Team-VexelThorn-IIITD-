"use client";

import { useEffect, useState } from "react";
import { ListingCard, useFormat } from "@/components/market";
import { ButtonLink, FormError, Loading, Screen, inputClass } from "@/components/ui";
import { api, type Listing } from "@/lib/api";
import { errorKey } from "@/lib/forms";
import { useCrops } from "@/lib/catalogue";
import { useI18n } from "@/lib/i18n";
import { STATES } from "@/lib/places";
import { useSession } from "@/lib/session";


export default function MarketPage() {
  const { t, lang } = useI18n();
  const f = useFormat();
  const catalogue = useCrops();
  const { user } = useSession(["customer", "farmer", "admin"]);
  const [crop, setCrop] = useState("");
  const [state, setState] = useState("");
  const [minQuintal, setMinQuintal] = useState("");
  const [listings, setListings] = useState<Listing[] | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams();
    if (crop) params.set("crop_code", crop);
    if (state) params.set("state", state);
    if (Number(minQuintal) > 0) params.set("min_quintal", String(Number(minQuintal)));
    let cancelled = false;
    api<Listing[]>(`/listings?${params}`)
      .then((rows) => {
        if (!cancelled) {
          setListings(rows);
          setError("");
        }
      })
      .catch((e) => !cancelled && setError(t(errorKey(e))));
    return () => {
      cancelled = true;
    };
  }, [user, crop, state, minQuintal, t]);

  if (!user) return <Screen><Loading /></Screen>;
  const wholesaler = user.customer_type === "wholesale";

  return (
    <Screen title={t("market.title")} back={user.role === "farmer" ? "/farmer" : undefined}>
      <div className="mb-5 hidden grid-cols-2 gap-3 lg:grid">
        <ButtonLink href="/market/prices" variant="secondary">{t("home.prices")}</ButtonLink>
        {user.role === "customer" && <ButtonLink href="/enquiries" variant="secondary">{t("market.myEnquiries")}</ButtonLink>}
      </div>
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label={t("sell.crop")}>
        {["", ...(catalogue ?? []).filter((x) => x.marketplace).map((x) => x.code)].map((c) => (
          <button key={c || "all"} type="button" aria-pressed={crop === c} onClick={() => setCrop(c)}
            className={`min-h-11 rounded-full border px-4 text-base font-semibold ${crop === c ? "border-white bg-white text-ink-strong" : "border-line bg-white/10"}`}>
            {c ? f.crop(c) : t("market.allCrops")}
          </button>
        ))}
      </div>
      <label htmlFor="state" className="sr-only">{t("auth.state")}</label>
      <select id="state" value={state} onChange={(e) => setState(e.target.value)} className={`${inputClass} mb-3`}>
        <option value="">{t("market.anyState")}</option>
        {STATES.map((s) => <option key={s.value} value={s.value}>{lang === "hi" ? s.hi : s.value}</option>)}
      </select>
      {wholesaler && (
        <div className="mb-3">
          <label htmlFor="minq" className="mb-1 block text-base font-semibold">{t("market.minQty")}</label>
          <input id="minq" inputMode="decimal" value={minQuintal} className={inputClass}
            onChange={(e) => setMinQuintal(e.target.value.replace(/[^\d.]/g, ""))} />
        </div>
      )}
      <FormError message={error} />
      {listings === null ? <Loading /> : listings.length === 0 ? (
        <p className="py-6 text-base text-muted">{t("market.empty")}</p>
      ) : (
        <div className="mt-4 flex flex-col gap-3">{listings.map((l) => <ListingCard key={l.id} l={l} />)}</div>
      )}
    </Screen>
  );
}
