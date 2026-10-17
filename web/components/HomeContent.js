"use client";

import LanguageToggle from "@/components/LanguageToggle";
import { useLanguage } from "@/components/LanguageProvider";

const STEPS = [
  { n: "one", icon: "📷" },
  { n: "two", icon: "🔍" },
  { n: "three", icon: "🛒" },
];

export default function HomeContent() {
  const { t } = useLanguage();

  return (
    <div className="mx-auto w-full max-w-3xl px-4 pb-10">
      <header className="flex items-center justify-between gap-3 py-4">
        <div className="min-w-0">
          <p className="truncate text-xl font-bold text-[var(--color-brand-strong)]">
            {t("app.name")}
          </p>
          <p className="text-sm text-[var(--color-text-muted)]">{t("app.tagline")}</p>
        </div>
        <LanguageToggle />
      </header>

      <main id="main">
        <section aria-labelledby="hero-heading" className="py-4">
          <h1
            id="hero-heading"
            className="text-2xl font-bold leading-tight text-[var(--color-text)] break-words"
          >
            {t("home.heading")}
          </h1>
          <p className="mt-2 text-lg text-[var(--color-text-muted)]">
            {t("home.subheading")}
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <button type="button" className="tap-target btn-primary w-full sm:w-auto" disabled>
              {t("home.primaryCta")}
            </button>
            <button type="button" className="tap-target btn-secondary w-full sm:w-auto" disabled>
              {t("home.secondaryCta")}
            </button>
          </div>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            {t("home.firstRun")}
          </p>
        </section>

        <section aria-label={t("home.firstRun")} className="py-2">
          <ol className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.n} className="card">
                <p className="text-2xl" aria-hidden="true">
                  {step.icon}
                </p>
                <p className="mt-1 font-semibold">
                  {i + 1}. {t(`home.steps.${step.n}.title`)}
                </p>
                <p className="mt-1 text-sm text-[var(--color-text-muted)]">
                  {t(`home.steps.${step.n}.body`)}
                </p>
              </li>
            ))}
          </ol>
        </section>

        <section
          aria-labelledby="foundation-heading"
          className="mt-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-muted)] p-4"
        >
          <h2 id="foundation-heading" className="font-semibold">
            {t("foundation.title")}
          </h2>
          <p className="mt-1 text-sm text-[var(--color-text-muted)]">
            {t("foundation.body")}
          </p>
          <ul className="mt-3 space-y-1 text-sm">
            {["frontend", "i18n", "backend", "model", "data"].map((item) => (
              <li key={item} className="flex gap-2">
                <span aria-hidden="true">
                  {item === "frontend" || item === "i18n" ? "✅" : "⏳"}
                </span>
                <span>{t(`foundation.items.${item}`)}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-[var(--color-text-muted)]">
            {t("foundation.sampleNote")}
          </p>
        </section>
      </main>

      <footer className="mt-6 border-t border-[var(--color-border)] pt-3">
        <p className="text-xs text-[var(--color-text-muted)]">{t("footer.disclaimer")}</p>
      </footer>
    </div>
  );
}
