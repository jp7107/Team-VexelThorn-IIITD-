"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button, Field, FormError, Screen, inputClass } from "@/components/ui";
import { api, homeFor, type User } from "@/lib/api";
import { describedBy, errorKey, PHONE_RE } from "@/lib/forms";
import { useI18n } from "@/lib/i18n";

export default function LoginPage() {
  const { t, setLang } = useI18n();
  const router = useRouter();
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: Record<string, string> = {};
    if (!PHONE_RE.test(phone)) next.phone = t("errors.phone");
    if (!password) next.password = t("errors.required");
    setErrors(next);
    setFormError("");
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      const user = await api<User>("/auth/login", { method: "POST", body: { phone, password } });
      setLang(user.language);
      router.replace(homeFor(user));
    } catch (err) {
      setFormError(t(errorKey(err, { UNAUTHENTICATED: "errors.wrongLogin", VALIDATION_ERROR: "errors.wrongLogin" })));
      setBusy(false);
    }
  }

  return (
    <Screen plain title={t("auth.loginTitle")} back="/">
      <form onSubmit={submit} noValidate>
        <FormError message={formError} />
        <Field id="phone" label={t("auth.phone")} hint={t("auth.phoneHint")} error={errors.phone}>
          <input {...describedBy("phone", true, errors.phone)} className={inputClass} type="tel" inputMode="numeric"
            autoComplete="tel-national" maxLength={10} value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} />
        </Field>
        <Field id="password" label={t("auth.password")} error={errors.password}>
          <input {...describedBy("password", false, errors.password)} className={inputClass} type="password"
            autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <Button type="submit" disabled={busy}>{busy ? t("common.loading") : t("auth.submitLogin")}</Button>
      </form>
      <p className="mt-6 text-lg">
        {t("auth.noAccount")}{" "}
        <Link href="/register" className="font-extrabold text-ink underline">{t("landing.createAccount")}</Link>
      </p>
    </Screen>
  );
}
