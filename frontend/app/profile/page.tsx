"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Button, Field, FormError, Loading, Screen, inputClass } from "@/components/ui";
import { api, forgetMe, homeFor, type User } from "@/lib/api";
import { describedBy, errorKey } from "@/lib/forms";
import { useI18n, type Lang } from "@/lib/i18n";
import { STATES } from "@/lib/places";
import { useSession } from "@/lib/session";

const UPI = /^[A-Za-z0-9._-]{2,40}@[A-Za-z][A-Za-z0-9.]{1,30}$/;

export default function ProfilePage() {
  const { t, lang, setLang } = useI18n();
  const { user } = useSession(["farmer", "customer", "admin"]);
  const [form, setForm] = useState<{ name: string; state: string; district: string; upi_id: string; language: Lang } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (user) {
      // The form starts from the server's copy once, when the session loads.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time copy of fetched data into the form
      setForm({ name: user.name, state: user.state, district: user.district, upi_id: user.upi_id ?? "", language: user.language });
    }
  }, [user]);

  if (!user || !form) return <Screen title={t("profile.title")}><Loading /></Screen>;
  const set = (k: keyof typeof form) => (v: string) => {
    setForm({ ...form, [k]: v });
    setSaved(false);
  };

  async function save(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!form!.name.trim()) next.name = t("errors.required");
    if (!form!.district.trim()) next.district = t("errors.required");
    if (user!.role === "farmer" && form!.upi_id.trim() && !UPI.test(form!.upi_id.trim())) next.upi_id = t("profile.upiInvalid");
    setErrors(next);
    if (Object.keys(next).length) return;
    setBusy(true);
    setError("");
    try {
      await api<User>("/me", { method: "PATCH", body: {
        name: form!.name.trim(), state: form!.state, district: form!.district.trim(), language: form!.language,
        ...(user!.role === "farmer" ? { upi_id: form!.upi_id.trim() } : {}),
      } });
      forgetMe();
      if (form!.language !== lang) setLang(form!.language);
      setSaved(true);
    } catch (err) {
      setError(t(errorKey(err)));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title={t("profile.title")} back={homeFor(user)}>
      <form onSubmit={save} noValidate className="glass rounded-2xl border border-white/15 p-4 lg:border-0 lg:bg-none lg:p-0 lg:shadow-none">
        <FormError message={error} />
        <Field id="name" label={t("auth.name")} error={errors.name}>
          <input {...describedBy("name", false, errors.name)} className={inputClass} maxLength={100} value={form.name}
            onChange={(e) => set("name")(e.target.value)} autoComplete="name" />
        </Field>
        <Field id="state" label={t("auth.state")}>
          <select id="state" className={inputClass} value={form.state} onChange={(e) => set("state")(e.target.value)}>
            {STATES.map((s) => <option key={s.value} value={s.value}>{lang === "hi" ? s.hi : s.value}</option>)}
          </select>
        </Field>
        <Field id="district" label={t("auth.district")} error={errors.district}>
          <input {...describedBy("district", false, errors.district)} className={inputClass} maxLength={60}
            value={form.district} onChange={(e) => set("district")(e.target.value)} autoComplete="address-level2" />
        </Field>
        <Field id="language" label={t("language.label")}>
          <select id="language" className={inputClass} value={form.language} onChange={(e) => set("language")(e.target.value)}>
            <option value="hi">हिंदी</option>
            <option value="en">English</option>
          </select>
        </Field>
        {user.role === "farmer" && (
          <Field id="upi_id" label={t("profile.upi")} hint={t("profile.upiHint")} error={errors.upi_id}>
            <input {...describedBy("upi_id", true, errors.upi_id)} className={inputClass} maxLength={60}
              value={form.upi_id} onChange={(e) => set("upi_id")(e.target.value)} placeholder="name@okaxis"
              autoCapitalize="none" spellCheck={false} />
          </Field>
        )}
        {saved && <p role="status" className="mb-4 rounded-xl bg-field-soft px-4 py-3 font-semibold text-field">{t("profile.saved")}</p>}
        <Button type="submit" disabled={busy}>{t("profile.save")}</Button>
      </form>
    </Screen>
  );
}
