"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { InfoIcon } from "@/components/icons";
import { Button } from "@/components/ui";
import { api, ApiError, describeError, homeFor, type User } from "@/lib/api";
import { useSession } from "@/lib/session";
import { useAuthT } from "@/features/auth/i18n";
import { Field, FormError, PHONE_RE, digitsOnly, safeNextPath } from "@/features/auth/fields";
import "@/features/auth/auth.css";

type Errors = { phone?: string; password?: string };

export function LoginForm() {
  const { t } = useAuthT();
  const { refresh } = useSession();
  const router = useRouter();
  const next = safeNextPath(useSearchParams().get("next"));

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;

    const found: Errors = {};
    if (!phone) found.phone = "auth.errPhoneRequired";
    else if (!PHONE_RE.test(phone)) found.phone = "auth.errPhoneFormat";
    if (!password) found.password = "auth.errPasswordRequired";
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      const user = await api<User>("/auth/login", { method: "POST", body: { phone, password } });
      const me = (await refresh()) ?? user;
      router.replace(next ?? homeFor(me));
    } catch (err) {
      // The backend's 401 message is the one the user needs ("Wrong phone number or password").
      setFormError(err instanceof ApiError && err.status === 401 ? err.message : describeError(err));
      setBusy(false);
    }
  }

  return (
    <form className="km-auth-form" onSubmit={onSubmit} noValidate>
      <header className="km-auth-head">
        <h1 className="km-auth-title">{t("auth.login.title")}</h1>
        <p className="km-caption">{t("auth.login.subtitle")}</p>
      </header>

      {next && <p className="km-auth-notice">{t("auth.login.continueNext")}</p>}

      <Field id="login-phone" label={t("auth.phoneLabel")} hint={t("auth.phoneHint")} error={errors.phone && t(errors.phone)}>
        {(control) => (
          <input
            {...control}
            className="km-input"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            autoFocus
            value={phone}
            onChange={(e) => {
              setPhone(digitsOnly(e.target.value));
              if (errors.phone) setErrors((prev) => ({ ...prev, phone: undefined }));
            }}
          />
        )}
      </Field>

      <Field id="login-password" label={t("auth.passwordLabel")} error={errors.password && t(errors.password)}>
        {(control) => (
          <input
            {...control}
            className="km-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (errors.password) setErrors((prev) => ({ ...prev, password: undefined }));
            }}
          />
        )}
      </Field>

      <FormError message={formError} />

      <Button type="submit" disabled={busy}>
        {busy ? t("auth.login.submitting") : t("auth.login.submit")}
      </Button>

      <p className="km-auth-swap">
        {t("auth.login.noAccount")} <Link className="km-linkish" href="/register">{t("auth.login.registerLink")}</Link>
      </p>

      <div className="km-auth-demo">
        <span className="km-auth-demo-title">
          <InfoIcon size={14} />
          {t("auth.login.demoTitle")}
        </span>
        <p>{t("auth.login.demoNote")}</p>
        <ul>
          <li><span>9000000001</span> {t("auth.role.admin")}</li>
          <li><span>9000000002</span>, <span>9000000003</span> {t("auth.role.farmer")}</li>
          <li><span>9000000004</span> {t("auth.role.buyerRetail")}</li>
          <li><span>9000000005</span> {t("auth.role.buyerWholesale")}</li>
        </ul>
      </div>

      <Link className="km-auth-guest" href="/">{t("auth.guest")}</Link>
    </form>
  );
}
