"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { useI18n, type Lang } from "@/lib/i18n";

export function LanguageSwitch() {
  const { lang, setLang, t } = useI18n();
  const options: Lang[] = ["hi", "en"];
  return (
    <div role="group" aria-label={t("language.label")} className="flex rounded-full bg-white/15 p-1">
      {options.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={lang === l}
          onClick={() => setLang(l)}
          className={`min-h-11 rounded-full px-4 text-base font-semibold ${
            lang === l ? "bg-white text-ink" : "text-white"
          }`}
        >
          {t(`language.${l}`)}
        </button>
      ))}
    </div>
  );
}

/** Indigo header band with the wordmark and language switch; every screen starts with it. */
export function TopBar({ right }: { right?: ReactNode }) {
  const { t } = useI18n();
  return (
    <header className="bg-ink text-white">
      <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="text-xl font-extrabold tracking-tight">
          {t("app.name")}
        </Link>
        {right ?? <LanguageSwitch />}
      </div>
    </header>
  );
}

export function Screen({ title, children, back }: { title?: string; children: ReactNode; back?: string }) {
  const { t } = useI18n();
  return (
    <>
      <TopBar />
      <main className="mx-auto w-full max-w-md flex-1 px-4 pb-12 pt-6">
        {back && (
          <Link href={back} className="mb-3 inline-flex min-h-11 items-center font-semibold text-ink underline">
            {t("common.back")}
          </Link>
        )}
        {title && <h1 className="mb-5 text-3xl font-extrabold leading-tight text-ink">{title}</h1>}
        {children}
      </main>
    </>
  );
}

type ButtonProps = ComponentProps<"button"> & { variant?: "primary" | "secondary" };

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  const look =
    variant === "primary"
      ? "bg-haldi text-ink-strong hover:brightness-95"
      : "border-2 border-ink text-ink bg-white hover:bg-surface";
  return (
    <button
      className={`min-h-14 w-full rounded-xl px-5 text-lg font-extrabold disabled:opacity-60 ${look} ${className}`}
      {...props}
    />
  );
}

export function ButtonLink({ variant = "primary", className = "", ...props }: ComponentProps<typeof Link> & {
  variant?: "primary" | "secondary";
}) {
  const look =
    variant === "primary" ? "bg-haldi text-ink-strong" : "border-2 border-ink text-ink bg-white";
  return (
    <Link
      className={`flex min-h-14 w-full items-center justify-center rounded-xl px-5 text-lg font-extrabold ${look} ${className}`}
      {...props}
    />
  );
}

export function Field({ id, label, hint, error, children }: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
}) {
  return (
    <div className="mb-5">
      <label htmlFor={id} className="mb-1 block text-lg font-semibold text-text">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="mb-2 text-base text-muted">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={`${id}-error`} className="mt-2 font-semibold text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export const inputClass =
  "block min-h-14 w-full rounded-xl border-2 border-line bg-white px-4 text-lg text-text " +
  "aria-[invalid=true]:border-danger focus:border-ink";

/** Big tap target used for every either/or choice (role, crop, stage). */
export function ChoiceTile({ selected, onSelect, icon, label, hint }: {
  selected: boolean;
  onSelect: () => void;
  icon?: ReactNode;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={`flex min-h-16 w-full items-center gap-3 rounded-xl border-2 px-4 py-3 text-left ${
        selected ? "border-ink bg-surface" : "border-line bg-white"
      }`}
    >
      {icon && <span className={`shrink-0 ${selected ? "text-ink" : "text-muted"}`}>{icon}</span>}
      <span>
        <span className="block text-lg font-extrabold text-text">{label}</span>
        {hint && <span className="block text-base text-muted">{hint}</span>}
      </span>
    </button>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="mb-5 rounded-xl bg-danger-soft px-4 py-3 font-semibold text-danger">
      {message}
    </p>
  );
}

export function Loading() {
  const { t } = useI18n();
  return <p className="py-10 text-center text-lg text-muted">{t("common.loading")}</p>;
}
