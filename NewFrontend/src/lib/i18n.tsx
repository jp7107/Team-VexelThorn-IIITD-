"use client";

// Bilingual copy (English + Hindi), like the rest of Kisan Mitra. Copy lives in src/messages/*.json and is
// applied client-side so the shell stays static and the choice persists in localStorage.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import en from "@/messages/en.json";
import hi from "@/messages/hi.json";
import adminEn from "@/messages/admin.en.json";
import adminHi from "@/messages/admin.hi.json";
import adviceEn from "@/messages/advice.en.json";
import adviceHi from "@/messages/advice.hi.json";
import assistantEn from "@/messages/assistant.en.json";
import assistantHi from "@/messages/assistant.hi.json";
import authEn from "@/messages/auth.en.json";
import authHi from "@/messages/auth.hi.json";
import contentEn from "@/messages/content.en.json";
import contentHi from "@/messages/content.hi.json";
import enquiriesEn from "@/messages/enquiries.en.json";
import enquiriesHi from "@/messages/enquiries.hi.json";
import healthEn from "@/messages/health.en.json";
import healthHi from "@/messages/health.hi.json";
import marketEn from "@/messages/market.en.json";
import marketHi from "@/messages/market.hi.json";
import pricesEn from "@/messages/prices.en.json";
import pricesHi from "@/messages/prices.hi.json";

export type Lang = "en" | "hi";
type Dict = Record<string, unknown>;
// Each feature keeps its copy in messages/<feature>.<lang>.json under its own top-level namespace, so a
// shallow merge is enough; the shared en/hi.json files are applied last.
const DICTS: Record<Lang, Dict> = {
  en: { ...adminEn, ...adviceEn, ...assistantEn, ...authEn, ...contentEn, ...enquiriesEn, ...healthEn, ...marketEn, ...pricesEn, ...en },
  hi: { ...adminHi, ...adviceHi, ...assistantHi, ...authHi, ...contentHi, ...enquiriesHi, ...healthHi, ...marketHi, ...pricesHi, ...hi },
};
const STORAGE_KEY = "kisan-mitra-lang";
const CHANGE_EVENT = "kisan-mitra-lang-change";

type Vars = Record<string, string | number>;
type Ctx = { lang: Lang; setLang: (l: Lang) => void; t: (key: string, vars?: Vars) => string };

const I18nContext = createContext<Ctx | null>(null);

function lookup(dict: unknown, key: string): string | undefined {
  const v = key
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], dict);
  return typeof v === "string" ? v : undefined;
}

function readStoredLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "hi" || v === "en" ? v : "en";
  } catch {
    return "en";
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const lang = useSyncExternalStore(subscribe, readStoredLang, () => "en" as Lang);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const setLang = useCallback((l: Lang) => {
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // private mode: the choice just will not persist
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
