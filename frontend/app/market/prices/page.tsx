"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useFormat } from "@/components/market";
import { FormError, Loading, Screen, inputClass } from "@/components/ui";
import { api, type Prices } from "@/lib/api";
import { errorKey } from "@/lib/forms";
import { useI18n } from "@/lib/i18n";
import { STATES } from "@/lib/places";
import { useSession } from "@/lib/session";

// The commodity names AGMARKNET uses, mapped to our crop codes for display.
const MVP: Record<string, string> = { Tomato: "tomato", Potato: "potato", Maize: "maize" };

export default function PricesPage() {
  const { t, lang } = useI18n();
  const f = useFormat();
  const { user } = useSession(["farmer", "customer", "admin"]);
  const [commodity, setCommodity] = useState("Tomato");
  const [other, setOther] = useState("");
  const [state, setState] = useState("");
  const [data, setData] = useState<Prices | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams({ commodity });
    if (state) params.set("state", state);
    let cancelled = false;
    api<Prices>(`/market/prices?${params}`)
      .then((d) => !cancelled && (setData(d), setError("")))
      .catch((e) => !cancelled && setError(t(errorKey(e))));
    return () => {
      cancelled = true;
    };
  }, [user, commodity, state, t]);

  if (!user) return <Screen><Loading /></Screen>;
  const num = new Intl.NumberFormat(lang === "hi" ? "hi-IN" : "en-IN", { maximumFractionDigits: 0 });
  const day = new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "long", year: "numeric" });
  const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN",
    { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(iso)) : "");

  function showOther(e: FormEvent) {
    e.preventDefault();
    if (other.trim()) setCommodity(other.trim());
  }

  const status = data?.meta.source_status;
  const banner = status === "demo" ? "bg-haldi-soft border-haldi text-ink" : status === "live" ? "bg-field-soft border-field text-field"
    : "bg-surface border-line text-text";

  return (
    <Screen title={t("prices.title")} back={user.role === "farmer" ? "/farmer" : user.role === "customer" ? "/market" : "/"}>
      <div className="mb-3 flex flex-wrap gap-2" role="group" aria-label={t("sell.crop")}>
        {Object.entries(MVP).map(([name, code]) => (
          <button key={name} type="button" aria-pressed={commodity === name} onClick={() => setCommodity(name)}
            className={`min-h-11 rounded-full border px-4 text-base font-semibold ${commodity === name ? "border-white bg-white text-ink-strong" : "border-line bg-white/10"}`}>
            {t(`crops.${code}`)}
          </button>
        ))}
      </div>
      <form onSubmit={showOther} className="mb-3 flex gap-2">
        <label htmlFor="other" className="sr-only">{t("prices.otherCommodity")}</label>
        <input id="other" value={other} onChange={(e) => setOther(e.target.value)} placeholder={t("prices.otherCommodity")}
          maxLength={60} className={`${inputClass} flex-1`} />
        <button type="submit" className="min-h-12 rounded-xl border border-white/30 px-4 text-base font-bold text-ink">{t("prices.go")}</button>
      </form>
      <label htmlFor="pstate" className="sr-only">{t("prices.state")}</label>
      <select id="pstate" value={state} onChange={(e) => setState(e.target.value)} className={`${inputClass} mb-4`}>
        <option value="">{t("prices.anyState")}</option>
        {STATES.map((s) => <option key={s.value} value={s.value}>{lang === "hi" ? s.hi : s.value}</option>)}
      </select>

      <FormError message={error} />
      {!data ? (!error && <Loading />) : (
        <>
          {status !== "none" && (
            <p role="status" className={`mb-4 rounded-xl border-l-8 px-4 py-3 text-base font-semibold ${banner}`}>
              {t(`prices.${status}`, { when: when(data.meta.last_fetch_at) })}
            </p>
          )}
          {status === "none" ? (
            <p className="text-base text-muted">{t("prices.none", { commodity: MVP[commodity] ? t(`crops.${MVP[commodity]}`) : commodity })}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {data.rows.map((r) => (
                <li key={r.id} className="glass rounded-2xl border border-white/15 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-base font-bold text-ink">
                      {r.market}, {r.district}
                      <span className="block text-base font-normal text-muted">{f.state(r.state)}{r.variety ? ` · ${r.variety}` : ""}</span>
                    </p>
                    {r.is_demo && <span className="rounded-full bg-haldi px-2 text-base font-bold text-ink-strong">{t("prices.demoBadge")}</span>}
                  </div>
                  <p className="mt-2 text-2xl font-bold">
                    ₹{num.format(Number(r.modal_price))} <span className="text-base font-semibold">{t("prices.perQuintal")}</span>
                  </p>
                  <p className="text-base text-muted">
                    {t("prices.modal")} · {t("prices.range", { min: num.format(Number(r.min_price)), max: num.format(Number(r.max_price)) })}
                  </p>
                  <p className="mt-1 text-base">
                    {t("prices.date", { date: day.format(new Date(r.arrival_date)) })}
                    {r.stale && <span className="ml-2 font-semibold text-danger">{t("prices.stale")}</span>}
                  </p>
                  <p className="text-base text-muted">{t("prices.source", { source: r.source })}</p>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Screen>
  );
}
