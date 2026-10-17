"use client";

import { useCallback, useEffect, useState } from "react";
import { CROP_ICONS } from "@/components/icons";
import { Button, ButtonLink, ChoiceTile, FormError, Loading, Screen } from "@/components/ui";
import { api, ApiError, type Crop, type WaterEstimate } from "@/lib/api";
import { errorKey } from "@/lib/forms";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

const SUPPORTED = new Set(["tomato", "potato", "maize"]);
type Need = "none" | "location" | "unsupported";
type Result = { id: string; estimate: WaterEstimate | null; need: Need; error: string };

export default function WaterPage() {
  const { t, lang } = useI18n();
  const { user } = useSession(["farmer"]);
  const [crops, setCrops] = useState<Crop[] | null>(null);
  const [cropId, setCropId] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    api<Crop[]>("/me/crops").then((cs) => {
      setCrops(cs);
      const first = cs.find((c) => SUPPORTED.has(c.crop_code));
      if (first) setCropId(first.id);
    }).catch((e) => setError(t(errorKey(e))));
  }, [user, t]);

  /** Fetches without touching state, so the effect below only sets state when the answer arrives. */
  const fetchResult = useCallback(async (id: string): Promise<Result> => {
    try {
      return { id, estimate: await api<WaterEstimate>(`/irrigation/estimate?farm_crop_id=${id}`), need: "none", error: "" };
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      const need: Need = code === "LOCATION_REQUIRED" ? "location" : code === "CROP_NOT_SUPPORTED" ? "unsupported" : "none";
      return { id, estimate: null, need, error: need === "none" ? t(errorKey(e)) : "" };
    }
  }, [t]);

  useEffect(() => {
    if (!cropId) return;
    let cancelled = false;
    fetchResult(cropId).then((r) => !cancelled && setResult(r));
    return () => {
      cancelled = true;
    };
  }, [cropId, fetchResult]);

  function shareLocation() {
    if (!navigator.geolocation) return setError(t("water.denied"));
    setLocating(true);
    setError("");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        // Rounded to ~1 km before it leaves the phone: enough for a weather forecast.
        const round = (n: number) => Math.round(n * 100) / 100;
        try {
          await api("/me", { method: "PATCH", body: { lat: round(pos.coords.latitude), lon: round(pos.coords.longitude) } });
          setResult(await fetchResult(cropId));
        } catch (e) {
          setError(t(errorKey(e)));
        } finally {
          setLocating(false);
        }
      },
      () => {
        setError(t("water.denied"));
        setLocating(false);
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 3_600_000 },
    );
  }

  const current = result?.id === cropId ? result : null;
  const estimate = current?.estimate ?? null;
  const need: Need = current?.need ?? "none";
  const busy = locating || (Boolean(cropId) && !current);
  const shownError = error || current?.error || "";

  if (!user || crops === null) return <Screen back="/farmer">{error ? <FormError message={error} /> : <Loading />}</Screen>;
  const num = new Intl.NumberFormat(lang === "hi" ? "hi-IN" : "en-IN", { maximumFractionDigits: 1 });
  const dayFmt = new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", { weekday: "short", day: "numeric" });
  const maxNeed = Math.max(1, ...(estimate?.days.map((d) => d.crop_need_mm) ?? [1]));

  return (
    <Screen title={t("water.title")} back="/farmer">
      {crops.length === 0 ? (
        <>
          <p className="mb-4 text-lg text-muted">{t("water.noCrops")}</p>
          <ButtonLink href="/onboarding">{t("home.addCrop")}</ButtonLink>
        </>
      ) : (
        <>
          <fieldset className="mb-5">
            <legend className="mb-2 text-lg font-semibold">{t("water.pickCrop")}</legend>
            <div className="flex flex-col gap-2">
              {crops.map((c) => {
                const Icon = CROP_ICONS[c.crop_code];
                return (
                  <ChoiceTile key={c.id} selected={cropId === c.id} onSelect={() => setCropId(c.id)}
                    icon={Icon ? <Icon className="size-9" /> : undefined}
                    label={c.crop_code in CROP_ICONS ? t(`crops.${c.crop_code}`) : c.crop_code}
                    hint={`${t(`stages.${c.stage}`)} · ${t("home.acres", { area: Number(c.area_acres) })}`} />
                );
              })}
            </div>
          </fieldset>

          <FormError message={shownError} />
          {busy && <p role="status" className="mb-4 text-lg text-muted">{t(locating ? "water.locating" : "common.loading")}</p>}

          {need === "unsupported" && <p className="text-lg text-muted">{t("water.unsupported")}</p>}
          {need === "location" && !busy && (
            <div className="rounded-2xl bg-surface p-4">
              <p className="mb-3 text-lg">{t("water.needLocation")}</p>
              <Button type="button" onClick={shareLocation}>{t("water.useLocation")}</Button>
            </div>
          )}

          {estimate && estimate.weather_status === "unavailable" && (
            <p className="rounded-xl bg-danger-soft px-4 py-3 text-lg font-semibold text-danger">{t("water.weatherDown")}</p>
          )}
          {estimate?.totals && (
            <>
              <section className="mb-4 rounded-2xl border-l-8 border-ink bg-surface p-5" aria-live="polite">
                {estimate.totals.net_mm > 0 ? (
                  <>
                    <p className="text-3xl font-extrabold leading-tight text-ink">{t("water.headline", { mm: num.format(estimate.totals.net_mm) })}</p>
                    <p className="mt-2 text-lg">{t("water.litres", { litres: num.format(estimate.totals.litres_for_field), acres: num.format(estimate.area_acres) })}</p>
                  </>
                ) : (
                  <p className="text-2xl font-extrabold text-field">{t("water.noneNeeded")}</p>
                )}
                <p className="mt-2 text-base text-muted">
                  {t("water.need", { mm: num.format(estimate.totals.crop_need_mm) })} · {t("water.rain", { mm: num.format(estimate.totals.rain_mm) })}
                </p>
              </section>

              <h2 className="mb-2 text-xl font-extrabold text-ink">{t("water.daily")}</h2>
              <ul className="mb-5 flex flex-col gap-2">
                {estimate.days.map((d) => (
                  <li key={d.date} className="grid grid-cols-[4.5rem_1fr] items-center gap-3">
                    <span className="text-base font-semibold">{dayFmt.format(new Date(d.date))}</span>
                    <span>
                      <span className="block h-3 rounded-full bg-ink" style={{ width: `${(d.crop_need_mm / maxNeed) * 100}%` }} aria-hidden="true" />
                      <span className="text-base text-muted">{t("water.dayRow", { need: num.format(d.crop_need_mm), rain: num.format(d.rain_mm) })}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}

          {estimate && (
            <>
              <p className="mb-3 rounded-xl border-2 border-line px-4 py-3 text-base">{t("water.estimateNote")}</p>
              <p className="mb-2 text-base text-muted">{t("water.stageKc", { stage: t(`stages.${estimate.stage}`), kc: estimate.kc })}</p>
              <details className="text-base">
                <summary className="min-h-11 cursor-pointer content-center font-semibold text-ink">{t("water.sources")}</summary>
                <p className="mb-2">{estimate.method}</p>
                <ul className="list-disc pl-5">
                  {estimate.sources.map((s) => (
                    <li key={s.url}><a href={s.url} target="_blank" rel="noopener noreferrer" className="text-ink underline">{s.name}</a></li>
                  ))}
                </ul>
              </details>
            </>
          )}
        </>
      )}
    </Screen>
  );
}
