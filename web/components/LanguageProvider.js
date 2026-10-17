"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { DEFAULT_LANGUAGE, LANG_STORAGE_KEY, SUPPORTED_LANGUAGES, translate } from "@/i18n";

const LanguageContext = createContext(null);

/**
 * UI language. Persisted in localStorage; never sent anywhere by itself.
 * IMPLEMENTATION_PLAN.md §15.2: Hindi default for farmers, English one tap away.
 * Read/write are wrapped because storage can throw in private windows.
 */
export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(DEFAULT_LANGUAGE);

  useEffect(() => {
    let stored = null;
    try {
      stored = window.localStorage.getItem(LANG_STORAGE_KEY);
    } catch {
      stored = null;
    }
    if (stored && SUPPORTED_LANGUAGES.includes(stored)) {
      setLangState(stored);
    }
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((next) => {
    if (!SUPPORTED_LANGUAGES.includes(next)) return;
    setLangState(next);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      /* storage unavailable: language still applies for this session */
    }
  }, []);

  const value = useMemo(
    () => ({
      lang,
      setLang,
      t: (key) => translate(lang, key),
    }),
    [lang, setLang]
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) {
    throw new Error("useLanguage must be used inside <LanguageProvider>");
  }
  return ctx;
}
