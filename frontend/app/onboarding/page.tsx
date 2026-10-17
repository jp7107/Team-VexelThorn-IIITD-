"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CROP_ICONS, SproutIcon } from "@/components/icons";
import { Button, ChoiceTile, Field, FormError, Loading, Screen, inputClass } from "@/components/ui";
import { api, type Crop } from "@/lib/api";
import { describedBy, errorKey } from "@/lib/forms";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";

// The crops the disease model covers first (plan D-09); anything else goes in "Other".
const KNOWN_CROPS = ["tomato", "potato", "maize"] as const;
const STAGES = ["initial", "development", "mid", "late"] as const;

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function OnboardingPage() {
  const { t } = useI18n();
  const router = useRouter();
  const { user } = useSession(["farmer"]);
  const [crop, setCrop] = useState<string>("");
  const [otherName, setOtherName] = useState("");
  const [stage, setStage] = useState<(typeof STAGES)[number] | "">("");
  const [sowingDate, setSowingDate] = useState("");
  const [area, setArea] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!user) return <Screen><Loading /></Screen>;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const cropCode = crop === "other" ? otherName.trim().toLowerCase().slice(0, 30) : crop;
    const areaNum = Number(area);
    const next: Record<string, string> = {};
    if (!cropCode) next.crop = t("errors.required");
    if (!stage) next.stage = t("errors.required");
    if (!sowingDate) next.sowingDate = t("errors.required");
    if (!(areaNum > 0 && areaNum < 1_000_000)) next.area = t("errors.area");
    setErrors(next);
    setFormError("");
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      await api<Crop>("/me/crops", {
        method: "POST",
        body: { crop_code: cropCode, stage, sowing_date: sowingDate, area_acres: areaNum.toFixed(2) },
      });
      router.replace("/farmer");
    } catch (err) {
      setFormError(t(errorKey(err)));
      setBusy(false);
    }
  }

  return (
    <Screen title={t("onboarding.title")}>
      <p className="mb-6 text-lg text-muted">{t("onboarding.intro")}</p>
      <form onSubmit={submit} noValidate>
        <FormError message={formError} />
        <fieldset className="mb-6" aria-describedby={errors.crop ? "crop-error" : undefined}>
          <legend className="mb-2 text-lg font-semibold">{t("onboarding.crop")}</legend>
          <div className="grid grid-cols-2 gap-3">
            {KNOWN_CROPS.map((c) => {
              const Icon = CROP_ICONS[c];
              return (
                <ChoiceTile key={c} selected={crop === c} onSelect={() => setCrop(c)}
                  icon={<Icon className="size-9" />} label={t(`crops.${c}`)} />
              );
            })}
            <ChoiceTile selected={crop === "other"} onSelect={() => setCrop("other")}
              icon={<SproutIcon className="size-9" />} label={t("onboarding.otherCrop")} />
          </div>
          {errors.crop && <p id="crop-error" className="mt-2 font-semibold text-danger">{errors.crop}</p>}
        </fieldset>

        {crop === "other" && (
          <Field id="otherName" label={t("onboarding.otherCropName")}>
            <input {...describedBy("otherName", false)} className={inputClass} maxLength={30} value={otherName}
              onChange={(e) => setOtherName(e.target.value)} />
          </Field>
        )}

        <fieldset className="mb-6" aria-describedby={errors.stage ? "stage-error" : undefined}>
          <legend className="mb-2 text-lg font-semibold">{t("onboarding.stage")}</legend>
          <div className="grid grid-cols-2 gap-3">
            {STAGES.map((s) => (
              <ChoiceTile key={s} selected={stage === s} onSelect={() => setStage(s)} label={t(`stages.${s}`)} />
            ))}
          </div>
          {errors.stage && <p id="stage-error" className="mt-2 font-semibold text-danger">{errors.stage}</p>}
        </fieldset>

        <Field id="sowingDate" label={t("onboarding.sowingDate")} error={errors.sowingDate}>
          <input {...describedBy("sowingDate", false, errors.sowingDate)} className={inputClass} type="date"
            max={today()} value={sowingDate} onChange={(e) => setSowingDate(e.target.value)} />
        </Field>
        <Field id="area" label={t("onboarding.area")} error={errors.area}>
          <input {...describedBy("area", false, errors.area)} className={inputClass} inputMode="decimal"
            value={area} onChange={(e) => setArea(e.target.value.replace(/[^\d.]/g, ""))} />
        </Field>

        <Button type="submit" disabled={busy}>{busy ? t("common.loading") : t("onboarding.save")}</Button>
      </form>
      <Link href="/farmer" className="mt-4 flex min-h-12 items-center justify-center text-lg font-semibold text-ink underline">
        {t("onboarding.skip")}
      </Link>
    </Screen>
  );
}
