"use client";

import { useParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { CROP_ICONS, SproutIcon } from "@/components/icons";
import { Button, ButtonLink, ChoiceTile, Field, FormError, inputClass, Loading, Screen } from "@/components/ui";
import { api, ApiError, type Crop, type CropUpdate, type Reminder } from "@/lib/api";
import { errorKey } from "@/lib/forms";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

const CONDITIONS: CropUpdate["condition"][] = ["good", "concern", "bad"];
const DOT = { good: "bg-field", concern: "bg-haldi", bad: "bg-danger" } as const;

function CropView() {
  const { t, lang } = useI18n();
  const { id } = useParams<{ id: string }>();
  const { user } = useSession(["farmer"]);
  const [crop, setCrop] = useState<Crop | null>(null);
  const [updates, setUpdates] = useState<CropUpdate[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [condition, setCondition] = useState<CropUpdate["condition"] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    if (!user) return;
    Promise.all([api<Crop>(`/me/crops/${id}`), api<CropUpdate[]>(`/me/crops/${id}/updates`), api<Reminder[]>("/me/reminders")])
      .then(([c, u, r]) => {
        setCrop(c);
        setUpdates(u);
        setReminders(r.filter((x) => x.farm_crop_id === id && !x.done_at));
      })
      .catch((e) => setError(t(e instanceof ApiError && (e.status === 404 || e.status === 422)
        ? "crop.notFound" : errorKey(e))));
  }, [user, id, t]);

  async function saveUpdate() {
    if (!condition) return;
    setBusy(true);
    setError("");
    try {
      const u = await api<CropUpdate>(`/me/crops/${id}/updates`, { method: "POST", body: { condition, note: note || null } });
      setUpdates((us) => [u, ...us]);
      setCondition(null);
      setNote("");
      setSaved(t("crop.saved"));
    } catch (e) {
      setError(t(errorKey(e)));
    } finally {
      setBusy(false);
    }
  }

  async function remind(titleKey: string, days: number) {
    setError("");
    try {
      const r = await api<Reminder>("/me/reminders", { method: "POST", body: {
        title: t(titleKey), due_at: new Date(Date.now() + days * 86_400_000).toISOString(), farm_crop_id: id,
      } });
      setReminders((rs) => [...rs, r].sort((a, b) => a.due_at.localeCompare(b.due_at)));
    } catch (e) {
      setError(t(errorKey(e)));
    }
  }

  async function markDone(rid: string) {
    try {
      await api(`/me/reminders/${rid}`, { method: "PATCH", body: { done: true } });
      setReminders((rs) => rs.filter((r) => r.id !== rid));
    } catch (e) {
      setError(t(errorKey(e)));
    }
  }

  if (!crop) return <Screen back="/farmer">{error ? <FormError message={error} /> : <Loading />}</Screen>;
  const Icon = CROP_ICONS[crop.crop_code] ?? SproutIcon;
  const locale = lang === "hi" ? "hi-IN" : "en-IN";
  const dayFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "long" });
  const timeFmt = new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  return (
    <Screen back="/farmer" title={crop.crop_code in CROP_ICONS ? t(`crops.${crop.crop_code}`) : crop.crop_code}>
      <div className="mb-6 flex items-center gap-4">
        <Icon className="size-14 shrink-0 text-field" />
        <div>
          <h1 className="text-2xl font-bold leading-tight text-ink lg:text-3xl">
            {crop.crop_code in CROP_ICONS ? t(`crops.${crop.crop_code}`) : crop.crop_code}
          </h1>
          <p className="text-base text-muted">
            {t(`stages.${crop.stage}`)}, {t("home.sownOn", { date: dayFmt.format(new Date(crop.sowing_date)) })},{" "}
            {t("home.acres", { area: Number(crop.area_acres) })}
          </p>
        </div>
      </div>
      <FormError message={error} />

      <section className="mb-8">
        <h2 className="mb-3 text-base font-semibold text-ink">{t("crop.howIsIt")}</h2>
        <div className="mb-4 flex flex-col gap-2">
          {CONDITIONS.map((c) => (
            <ChoiceTile key={c} selected={condition === c} label={t(`crop.cond.${c}`)}
              icon={<span className={`block size-5 rounded-full ${DOT[c]}`} />}
              onSelect={() => { setCondition(c); setSaved(""); }} />
          ))}
        </div>
        {condition && (
          <>
            <Field id="note" label={t("crop.noteLabel")} hint={t("crop.noteHint")}>
              <textarea id="note" value={note} maxLength={500} rows={3} onChange={(e) => setNote(e.target.value)}
                aria-describedby="note-hint" className={`${inputClass} py-3`} />
            </Field>
            <Button onClick={saveUpdate} disabled={busy}>{t("crop.save")}</Button>
          </>
        )}
        {saved && <p role="status" className="mt-3 font-semibold text-field">{saved}</p>}
        {condition && condition !== "good" && (
          <ButtonLink href="/farmer/diagnose" variant="secondary" className="mt-3">{t("crop.checkPhoto")}</ButtonLink>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-base font-semibold text-ink">{t("crop.history")}</h2>
        {updates.length === 0 ? (
          <p className="text-base text-muted">{t("crop.noHistory")}</p>
        ) : (
          <ol className="flex flex-col gap-3 border-l-2 border-line pl-4">
            {updates.map((u) => (
              <li key={u.id} className="relative">
                <span className={`absolute -left-[1.45rem] top-1.5 size-3 rounded-full ${DOT[u.condition]}`} />
                <span className="block text-base font-bold">{t(`crop.cond.${u.condition}`)}</span>
                <span className="block text-base text-muted">{timeFmt.format(new Date(u.created_at))}</span>
                {u.note && <span className="block text-base">{u.note}</span>}
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-base font-semibold text-ink">{t("crop.reminders")}</h2>
        {reminders.length === 0 ? (
          <p className="mb-3 text-base text-muted">{t("crop.noReminders")}</p>
        ) : (
          <ul className="mb-3 flex flex-col gap-2">
            {reminders.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-haldi-soft px-4 py-3">
                <span>
                  <span className="block text-base font-semibold">{r.title}</span>
                  <span className="block text-base text-muted">{dayFmt.format(new Date(r.due_at))}</span>
                </span>
                <button type="button" onClick={() => markDone(r.id)}
                  className="min-h-11 shrink-0 rounded-lg border border-white/30 px-3 font-bold text-ink">
                  {t("home.markDone")}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Button variant="secondary" className="min-h-11 px-2 text-sm leading-tight" onClick={() => remind("crop.remindCheckTitle", 3)}>{t("crop.remindCheck")}</Button>
          <Button variant="secondary" className="min-h-11 px-2 text-sm leading-tight" onClick={() => remind("crop.remindWaterTitle", 7)}>{t("crop.remindWater")}</Button>
        </div>
      </section>

      <div className="flex flex-col gap-3">
        <ButtonLink href="/farmer/diagnose">{t("home.checkCrop")}</ButtonLink>
        <ButtonLink href="/farmer/water" variant="secondary">{t("home.water")}</ButtonLink>
      </div>
    </Screen>
  );
}

// The id comes from the URL, which cacheComponents treats as request data: it must sit inside <Suspense>.
export default function CropPage() {
  return (
    <Suspense fallback={<Screen back="/farmer"><Loading /></Screen>}>
      <CropView />
    </Suspense>
  );
}
