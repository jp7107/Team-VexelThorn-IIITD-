"use client";

// Minimal home so onboarding has somewhere to land. The full dashboard is plan task FE-03.
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CROP_ICONS, SproutIcon } from "@/components/icons";
import { ButtonLink, FormError, Loading, Screen } from "@/components/ui";
import { api, type Crop, type Reminder } from "@/lib/api";
import { errorKey } from "@/lib/forms";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

export default function FarmerHome() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const { user } = useSession(["farmer"]);
  const [crops, setCrops] = useState<Crop[] | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!user) return;
    Promise.all([api<Crop[]>("/me/crops"), api<Reminder[]>("/me/reminders?due=true")])
      .then(([c, r]) => {
        setCrops(c);
        setReminders(r);
      })
      .catch((e) => setError(t(errorKey(e))));
  }, [user, t]);

  async function markDone(id: string) {
    try {
      await api(`/me/reminders/${id}`, { method: "PATCH", body: { done: true } });
      setReminders((rs) => rs.filter((r) => r.id !== id));
    } catch (e) {
      setError(t(errorKey(e)));
    }
  }

  async function logout() {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    router.replace("/");
  }

  if (!user) return <Screen><Loading /></Screen>;
  const dateFmt = new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", { day: "numeric", month: "long" });
  const cropName = (code: string) => (code in CROP_ICONS ? t(`crops.${code}`) : code);

  return (
    <Screen title={t("home.greeting", { name: user.name })}>
      <FormError message={error} />
      <div className="mb-8 flex flex-col gap-3">
        <ButtonLink href="/farmer/diagnose">{t("home.checkCrop")}</ButtonLink>
        <ButtonLink href="/farmer/water" variant="secondary">{t("home.water")}</ButtonLink>
        <ButtonLink href="/market/prices" variant="secondary">{t("home.prices")}</ButtonLink>
        <ButtonLink href="/farmer/listings" variant="secondary">{t("home.sell")}</ButtonLink>
        <ButtonLink href="/enquiries" variant="secondary">{t("home.enquiries")}</ButtonLink>
        <ButtonLink href="/assistant" variant="secondary">{t("home.askAssistant")}</ButtonLink>
        <div className="grid grid-cols-2 gap-3">
          <ButtonLink href="/schemes" variant="secondary">{t("home.schemes")}</ButtonLink>
          <ButtonLink href="/updates" variant="secondary">{t("home.updates")}</ButtonLink>
        </div>
      </div>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-extrabold text-ink">{t("home.dueReminders")}</h2>
        {reminders.length === 0 ? (
          <p className="text-lg text-muted">{t("home.noReminders")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {reminders.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-haldi-soft px-4 py-3">
                <span className="text-lg font-semibold">{r.title}</span>
                <button type="button" onClick={() => markDone(r.id)}
                  className="min-h-11 shrink-0 rounded-lg border-2 border-ink px-3 font-extrabold text-ink">
                  {t("home.markDone")}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-xl font-extrabold text-ink">{t("home.myCrops")}</h2>
        {crops === null && !error ? (
          <Loading />
        ) : crops?.length ? (
          <ul className="mb-4 flex flex-col gap-2">
            {crops.map((c) => {
              const Icon = CROP_ICONS[c.crop_code] ?? SproutIcon;
              return (
                <li key={c.id} className="flex items-center gap-4 rounded-xl border-2 border-line px-4 py-3">
                  <Icon className="size-10 shrink-0 text-field" />
                  <span>
                    <span className="block text-lg font-extrabold">{cropName(c.crop_code)}</span>
                    <span className="block text-base text-muted">
                      {t(`stages.${c.stage}`)}, {t("home.sownOn", { date: dateFmt.format(new Date(c.sowing_date)) })},{" "}
                      {t("home.acres", { area: Number(c.area_acres) })}
                    </span>
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mb-4 text-lg text-muted">{t("home.noCrops")}</p>
        )}
        <ButtonLink href="/onboarding" variant="secondary">{t("home.addCrop")}</ButtonLink>
      </section>

      <button type="button" onClick={logout} className="min-h-12 text-lg font-semibold text-ink underline">
        {t("auth.logout")}
      </button>
    </Screen>
  );
}
