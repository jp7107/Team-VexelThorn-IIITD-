"use client";

// Plain JSON dictionaries (plan §15.3 fallback). Language lives in localStorage and the user's profile;
// it's applied client-side because the root layout is a prerendered static shell (cacheComponents).
import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import en from "@/messages/en.json";
import hi from "@/messages/hi.json";

export type Lang = "hi" | "en";
const DICTS = { en, hi } as const;
const STORAGE_KEY = "lang";
export const DEFAULT_LANG: Lang = "hi"; // Hindi-first product

type Vars = Record<string, string | number>;
type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (key: string, vars?: Vars) => string };

const I18nContext = createContext<Ctx | null>(null);

function lookup(dict: unknown, key: string): string | undefined {
  const v = key.split(".").reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], dict);
  return typeof v === "string" ? v : undefined;
}

function readStoredLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "hi" || v === "en" ? v : DEFAULT_LANG;
  } catch {
    return DEFAULT_LANG;
  }
}

const CHANGE_EVENT = "lang-change";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange); // other tabs
  window.addEventListener(CHANGE_EVENT, onChange); // this tab
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // Server render and first paint use the default; the stored choice applies right after hydration.
  const lang = useSyncExternalStore(subscribe, readStoredLang, () => DEFAULT_LANG);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // Private mode: the choice just won't persist.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const t = useCallback(
    (key: string, vars?: Vars) => {
      const s = lookup(DICTS[lang], key) ?? lookup(DICTS.en, key) ?? key;
      return vars ? s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : s;
    },
    [lang],
  );

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
