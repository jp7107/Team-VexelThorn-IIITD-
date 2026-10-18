"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { CartIcon, TractorIcon } from "@/components/icons";
import { Button } from "@/components/ui";
import { api, ApiError, describeError, homeFor, type User } from "@/lib/api";
import { STATES } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useSession } from "@/lib/session";
import { useAuthT } from "@/features/auth/i18n";
import { Field, FormError, PHONE_RE, digitsOnly } from "@/features/auth/fields";
import "@/features/auth/auth.css";

type Role = "farmer" | "customer";
type CustomerType = "retail" | "wholesale";
type Lang = "en" | "hi";

type Errors = {
  name?: string;
  phone?: string;
  password?: string;
  role?: string;
  customerType?: string;
  state?: string;
  district?: string;
};

/** Mirrors the backend RegisterIn constraints so the user is stopped before a round trip. */
function validate(v: {
  name: string;
  phone: string;
  password: string;
  role: Role | null;
  customerType: CustomerType | null;
  state: string;
  district: string;
}): Errors {
  const e: Errors = {};
  if (!v.name.trim()) e.name = "auth.errNameRequired";
  else if (v.name.trim().length > 100) e.name = "auth.errNameLong";
  if (!v.phone) e.phone = "auth.errPhoneRequired";
  else if (!PHONE_RE.test(v.phone)) e.phone = "auth.errPhoneFormat";
  if (!v.password) e.password = "auth.errPasswordRequired";
  else if (v.password.length < 8) e.password = "auth.errPasswordShort";
  else if (v.password.length > 128) e.password = "auth.errPasswordLong";
  if (!v.role) e.role = "auth.errRoleRequired";
  if (v.role === "customer" && !v.customerType) e.customerType = "auth.errCustomerTypeRequired";
  if (!v.state) e.state = "auth.errStateRequired";
  if (!v.district.trim()) e.district = "auth.errDistrictRequired";
  else if (v.district.trim().length > 60) e.district = "auth.errDistrictLong";
  return e;
}

export function RegisterForm() {
  const { t, lang } = useAuthT();
  const { setLang } = useI18n();
  const { refresh } = useSession();
  const router = useRouter();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role | null>(null);
  const [customerType, setCustomerType] = useState<CustomerType | null>(null);
  // The UI language is a sensible default; the user can still choose either for their account.
  const [language, setLanguage] = useState<Lang>(lang);
  const [state, setState] = useState("");
  const [district, setDistrict] = useState("");

  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function clear<K extends keyof Errors>(key: K) {
    if (errors[key]) setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;

    const found = validate({ name, phone, password, role, customerType, state, district });
    setErrors(found);
    setFormError(null);
    if (Object.keys(found).length > 0) return;

    setBusy(true);
    try {
      const user = await api<User>("/auth/register", {
        method: "POST",
        body: {
          name: name.trim(),
          phone,
          password,
          role,
          // Farmers must not send customer_type; customers must send exactly one.
          ...(role === "customer" ? { customer_type: customerType } : {}),
          language,
          state,
          district: district.trim(),
        },
      });
      // Apply the language chosen for this account to the interface right away.
      setLang(language);
      const me = (await refresh()) ?? user;
      router.replace(homeFor(me));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // "This phone number is already registered" — the field is what needs fixing.
        setErrors((prev) => ({ ...prev, phone: "auth.errPhoneTaken" }));
        setFormError(err.message);
      } else {
        setFormError(describeError(err));
      }
      setBusy(false);
    }
  }

  return (
    <form className="km-auth-form" onSubmit={onSubmit} noValidate>
      <header className="km-auth-head">
        <h1 className="km-auth-title">{t("auth.register.title")}</h1>
        <p className="km-caption">{t("auth.register.subtitle")}</p>
      </header>

      <Field id="reg-name" label={t("auth.nameLabel")} error={errors.name && t(errors.name)}>
        {(control) => (
          <input
            {...control}
            className="km-input"
            type="text"
            autoComplete="name"
            autoFocus
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              clear("name");
            }}
          />
        )}
      </Field>

      <Field id="reg-phone" label={t("auth.phoneLabel")} hint={t("auth.phoneHint")} error={errors.phone && t(errors.phone)}>
        {(control) => (
          <input
            {...control}
            className="km-input"
            type="tel"
            inputMode="numeric"
            autoComplete="tel"
            value={phone}
            onChange={(e) => {
              setPhone(digitsOnly(e.target.value));
              clear("phone");
            }}
          />
        )}
      </Field>

      <Field
        id="reg-password"
        label={t("auth.passwordLabel")}
        hint={t("auth.passwordHint")}
        error={errors.password && t(errors.password)}
      >
        {(control) => (
          <input
            {...control}
            className="km-input"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              clear("password");
            }}
          />
        )}
      </Field>

      <fieldset className="km-auth-fieldset">
        <legend className="km-label">{t("auth.roleLabel")}</legend>
        <div className="km-auth-tiles" role="radiogroup" aria-label={t("auth.roleLabel")}>
          {([
            { value: "farmer" as Role, icon: <TractorIcon size={20} />, title: "auth.role.farmer", sub: "auth.register.farmerSub" },
            { value: "customer" as Role, icon: <CartIcon size={20} />, title: "auth.role.buyer", sub: "auth.register.buyerSub" },
          ]).map((opt) => (
            <label key={opt.value} className={`km-auth-tile${role === opt.value ? " selected" : ""}`}>
              <input
                type="radio"
                name="role"
                value={opt.value}
                checked={role === opt.value}
                onChange={() => {
                  setRole(opt.value);
                  if (opt.value === "farmer") setCustomerType(null);
                  clear("role");
                }}
              />
              <span className="km-auth-tile-icon">{opt.icon}</span>
              <span className="km-auth-tile-title">{t(opt.title)}</span>
              <span className="km-caption">{t(opt.sub)}</span>
            </label>
          ))}
        </div>
        {errors.role && <p className="km-error">{t(errors.role)}</p>}
      </fieldset>

      {role === "customer" && (
        <fieldset className="km-auth-fieldset">
          <legend className="km-label">{t("auth.customerTypeLabel")}</legend>
          <div className="km-auth-segment">
            {(["retail", "wholesale"] as CustomerType[]).map((ct) => (
              <label key={ct} className={`km-auth-segment-opt${customerType === ct ? " selected" : ""}`}>
                <input
                  type="radio"
                  name="customer_type"
                  value={ct}
                  checked={customerType === ct}
                  onChange={() => {
                    setCustomerType(ct);
                    clear("customerType");
                  }}
                />
                {t(ct === "retail" ? "auth.customerType.retail" : "auth.customerType.wholesale")}
              </label>
            ))}
          </div>
          {errors.customerType && <p className="km-error">{t(errors.customerType)}</p>}
        </fieldset>
      )}

      <fieldset className="km-auth-fieldset">
        <legend className="km-label">{t("auth.languageLabel")}</legend>
        <div className="km-auth-segment">
          {(["en", "hi"] as Lang[]).map((l) => (
            <label key={l} className={`km-auth-segment-opt${language === l ? " selected" : ""}`}>
              <input
                type="radio"
                name="language"
                value={l}
                checked={language === l}
                onChange={() => setLanguage(l)}
              />
              {l === "en" ? t("auth.language.en") : t("auth.language.hi")}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="km-auth-row">
        <Field id="reg-state" label={t("auth.stateLabel")} error={errors.state && t(errors.state)}>
          {(control) => (
            <select
              {...control}
              className="km-select"
              value={state}
              onChange={(e) => {
                setState(e.target.value);
                clear("state");
              }}
            >
              <option value="">{t("auth.statePlaceholder")}</option>
              {STATES.map((s) => (
                <option key={s.value} value={s.value}>
                  {lang === "hi" ? s.hi : s.value}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field id="reg-district" label={t("auth.districtLabel")} error={errors.district && t(errors.district)}>
          {(control) => (
            <input
              {...control}
              className="km-input"
              type="text"
              autoComplete="address-level2"
              maxLength={60}
              value={district}
              onChange={(e) => {
                setDistrict(e.target.value);
                clear("district");
              }}
            />
          )}
        </Field>
      </div>

      <FormError message={formError} />

      <Button type="submit" disabled={busy}>
        {busy ? t("auth.register.submitting") : t("auth.register.submit")}
      </Button>

      <p className="km-auth-swap">
        {t("auth.register.haveAccount")}{" "}
        <Link className="km-linkish" href="/login">{t("auth.register.loginLink")}</Link>
      </p>

      <Link className="km-auth-guest" href="/">{t("auth.guest")}</Link>
    </form>
  );
}
