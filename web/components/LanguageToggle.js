"use client";

import { useLanguage } from "@/components/LanguageProvider";

export default function LanguageToggle() {
  const { lang, setLang, t } = useLanguage();
  const next = lang === "hi" ? "en" : "hi";

  return (
    <button
      type="button"
      className="tap-target btn-secondary text-sm"
      onClick={() => setLang(next)}
      aria-label={`${t("language.label")}: ${t("language.switch_to")}`}
      lang={next}
    >
      <span aria-hidden="true">🌐</span>
      {t("language.switch_to")}
    </button>
  );
}
