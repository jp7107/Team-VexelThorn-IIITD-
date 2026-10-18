"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { AppShell } from "@/components/AppShell";
import { LogoMark } from "@/components/icons";
import { useI18n, type Lang } from "@/lib/i18n";

// Short labels for the phone header, where space is tight.
const SHORT: Record<Lang, string> = { hi: "हिं", en: "EN" };

export function LanguageSwitch({ compact }: { compact?: boolean }) {
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
          aria-label={t(`language.${l}`)}
          className={`rounded-full font-semibold ${compact ? "min-h-8 min-w-9 px-2 text-xs" : "min-h-9 px-3 text-sm"} ${
            lang === l ? "bg-white text-ink-strong" : "text-white"
          }`}
        >
          {compact ? SHORT[l] : t(`language.${l}`)}
        </button>
      ))}
    </div>
  );
}

/** Green header band with the wordmark and language switch, for pages outside the signed-in shell. */
export function TopBar({ right }: { right?: ReactNode }) {
  const { t } = useI18n();
  return (
    <header className="glass border-b border-white/10 text-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 text-base font-semibold tracking-tight">
          <LogoMark className="size-9 bg-white/15" />
          {t("app.name")}
        </Link>
        {right ?? <LanguageSwitch />}
      </div>
    </header>
  );
}

export function Screen({ title, children, back, wide, plain }: {
  title?: string;
  children: ReactNode;
  back?: string;
  /** Use the full dashboard width on desktop instead of a single reading column. */
  wide?: boolean;
  /** Plain header instead of the signed-in app shell (login, register). */
  plain?: boolean;
}) {
  const { t } = useI18n();
  const body = (
    <>
      {back && (
        <Link href={back} className={`mb-3 min-h-11 items-center font-semibold text-ink underline ${plain ? "inline-flex" : "hidden lg:inline-flex"}`}>
          {t("common.back")}
        </Link>
      )}
      {title && (
        <h1 className={`mb-4 text-2xl font-bold leading-tight text-ink lg:text-3xl ${plain ? "" : "hidden lg:block"}`}>{title}</h1>
      )}
      {children}
    </>
  );
  if (!plain) return <AppShell wide={wide} title={title} back={back}>{body}</AppShell>;
  return (
    <>
      <TopBar />
      <main className="animate-enter mx-auto w-full max-w-md flex-1 px-4 pb-12 pt-6"><div className="glass rounded-3xl border border-white/15 p-5">{body}</div></main>
    </>
  );
}

type ButtonProps = ComponentProps<"button"> & { variant?: "primary" | "secondary" };

export function Button({ variant = "primary", className = "", ...props }: ButtonProps) {
  const look =
    variant === "primary"
      ? "bg-lime text-ink-strong shadow-sm hover:brightness-105"
      : "border border-white/30 text-ink bg-white/10 hover:bg-surface";
  return (
    <button
      className={`min-h-12 w-full rounded-xl px-5 text-base font-bold disabled:opacity-60 ${look} ${className}`}
      {...props}
    />
  );
}

export function ButtonLink({ variant = "primary", className = "", ...props }: ComponentProps<typeof Link> & {
  variant?: "primary" | "secondary";
}) {
  const look =
    variant === "primary" ? "bg-lime text-ink-strong shadow-sm hover:brightness-105" : "border border-white/30 text-ink bg-white/10";
  return (
    <Link
      className={`flex min-h-12 w-full items-center justify-center rounded-xl px-5 text-base font-bold ${look} ${className}`}
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
      <label htmlFor={id} className="mb-1 block font-semibold text-text">
        {label}
      </label>
      {hint && (
        <p id={`${id}-hint`} className="mb-2 text-sm text-muted">
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
  "block min-h-12 w-full rounded-xl border border-line bg-white/10 px-4 text-base text-text " +
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
      className={`flex min-h-12 w-full items-center gap-3 rounded-xl border px-4 py-2.5 text-left ${
        selected ? "border-ink bg-surface" : "border-line bg-white/10"
      }`}
    >
      {icon && <span className={`shrink-0 ${selected ? "text-ink" : "text-muted"}`}>{icon}</span>}
      <span>
        <span className="block font-bold text-text">{label}</span>
        {hint && <span className="block text-sm text-muted">{hint}</span>}
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
  return <p className="py-10 text-center text-base text-muted">{t("common.loading")}</p>;
}
