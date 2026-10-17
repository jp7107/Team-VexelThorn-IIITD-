"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { FarmerIcon, StoreIcon } from "@/components/icons";
import { Button, ChoiceTile, Field, FormError, Screen, inputClass } from "@/components/ui";
import { api, type User } from "@/lib/api";
import { describedBy, errorKey, PHONE_RE } from "@/lib/forms";
import { useI18n } from "@/lib/i18n";
import { STATES } from "@/lib/places";

type Role = "farmer" | "customer";
type BuyerType = "retail" | "wholesale";

export default function RegisterPage() {
  const { t, lang } = useI18n();
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(null);
  const [buyerType, setBuyerType] = useState<BuyerType>("retail");
  const [form, setForm] = useState({ name: "", phone: "", password: "", state: "", district: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const set = (key: keyof typeof form) => (value: string) => setForm((f) => ({ ...f, [key]: value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form.name.trim()) next.name = t("errors.required");
    if (!PHONE_RE.test(form.phone)) next.phone = t("errors.phone");
    if (form.password.length < 8) next.password = t("errors.password");
    if (!form.state) next.state = t("errors.required");
    if (!form.district.trim()) next.district = t("errors.required");
    setErrors(next);
    setFormError("");
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      const user = await api<User>("/auth/register", {
        method: "POST",
        body: { ...form, role, customer_type: role === "customer" ? buyerType : null, language: lang },
      });
      router.replace(user.role === "farmer" ? "/onboarding" : "/market");
    } catch (err) {
      setFormError(t(errorKey(err, { CONFLICT: "errors.phoneTaken" })));
      setBusy(false);
    }
  }

  if (!role) {
    // Step 1: one decision per screen keeps it easy for first-time smartphone users.
    return (
      <Screen title={t("auth.registerTitle")} back="/">
        <h2 className="mb-3 text-xl font-semibold">{t("auth.whoAreYou")}</h2>
        <div className="flex flex-col gap-3">
          <ChoiceTile selected={false} onSelect={() => setRole("farmer")} icon={<FarmerIcon className="size-10" />}
            label={t("auth.farmer")} hint={t("auth.farmerHint")} />
          <ChoiceTile selected={false} onSelect={() => setRole("customer")} icon={<StoreIcon className="size-10" />}
            label={t("auth.buyer")} hint={t("auth.buyerHint")} />
        </div>
        <p className="mt-6 text-lg">
          {t("auth.haveAccount")}{" "}
          <Link href="/login" className="font-extrabold text-ink underline">{t("landing.login")}</Link>
        </p>
      </Screen>
    );
  }

  return (
    <Screen title={t("auth.registerTitle")}>
      <p className="mb-5 flex items-center justify-between rounded-xl bg-surface px-4 py-3 text-lg font-semibold">
        <span>{role === "farmer" ? t("auth.farmer") : t("auth.buyer")}</span>
        <button type="button" onClick={() => setRole(null)} className="min-h-11 px-2 font-extrabold text-ink underline">
          {t("auth.changeRole")}
        </button>
      </p>
      <form onSubmit={submit} noValidate>
        <FormError message={formError} />
        {role === "customer" && (
          <fieldset className="mb-5">
            <legend className="mb-2 text-lg font-semibold">{t("auth.buyerType")}</legend>
            <div className="grid grid-cols-2 gap-3">
              {(["retail", "wholesale"] as const).map((type) => (
                <ChoiceTile key={type} selected={buyerType === type} onSelect={() => setBuyerType(type)}
                  label={t(`auth.${type}`)} />
              ))}
            </div>
          </fieldset>
        )}
        <Field id="name" label={t("auth.name")} error={errors.name}>
          <input {...describedBy("name", false, errors.name)} className={inputClass} autoComplete="name"
            maxLength={100} value={form.name} onChange={(e) => set("name")(e.target.value)} />
        </Field>
        <Field id="phone" label={t("auth.phone")} hint={t("auth.phoneHint")} error={errors.phone}>
          <input {...describedBy("phone", true, errors.phone)} className={inputClass} type="tel" inputMode="numeric"
            autoComplete="tel-national" maxLength={10} value={form.phone}
            onChange={(e) => set("phone")(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <Field id="password" label={t("auth.password")} hint={t("auth.passwordHint")} error={errors.password}>
          <input {...describedBy("password", true, errors.password)} className={inputClass} type="password"
            autoComplete="new-password" maxLength={128} value={form.password}
            onChange={(e) => set("password")(e.target.value)} />
        </Field>
        <Field id="state" label={t("auth.state")} error={errors.state}>
          <select {...describedBy("state", false, errors.state)} className={inputClass} value={form.state}
            onChange={(e) => set("state")(e.target.value)}>
            <option value="">{t("auth.chooseState")}</option>
            {STATES.map((s) => (
              <option key={s.value} value={s.value}>{lang === "hi" ? s.hi : s.value}</option>
            ))}
          </select>
        </Field>
        <Field id="district" label={t("auth.district")} error={errors.district}>
          <input {...describedBy("district", false, errors.district)} className={inputClass}
            autoComplete="address-level2" maxLength={60} value={form.district}
            onChange={(e) => set("district")(e.target.value)} />
        </Field>
        <Button type="submit" disabled={busy}>{busy ? t("common.loading") : t("auth.submitRegister")}</Button>
      </form>
    </Screen>
  );
}
