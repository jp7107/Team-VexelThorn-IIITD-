"use client";

// Namespaced copy for the content & admin features.
//
// The app's i18n provider (src/lib/i18n.tsx) loads src/messages/en.json|hi.json, which this feature does
// not own. Each feature agent contributes its copy in its own file, nested under its namespace, so the
// orchestrator can merge `content` and `admin` into the global dictionaries. Until that merge happens the
// global `t` would return the raw key, so this small hook resolves keys against the feature dictionaries
// first and only then falls back to the shared provider (for common.* labels such as "retry").
//
// Keys are written in full, e.g. t("content.schemes.title") or t("admin.common.save").

import contentEn from "@/messages/content.en.json";
import contentHi from "@/messages/content.hi.json";
import adminEn from "@/messages/admin.en.json";
import adminHi from "@/messages/admin.hi.json";
import { useI18n, type Lang } from "@/lib/i18n";

type Vars = Record<string, string | number>;
type Dict = Record<string, unknown>;

const DICTS: Record<Lang, Dict> = {
  en: { ...contentEn, ...adminEn },
  hi: { ...contentHi, ...adminHi },
};

function lookup(dict: Dict, key: string): string | undefined {
  const v = key
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], dict);
  return typeof v === "string" ? v : undefined;
}

function interpolate(s: string, vars?: Vars): string {
  return vars ? s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : s;
}

/** Returns `{t, lang}` where `t` resolves content/admin keys and falls back to the shared dictionary. */
export function useContentI18n(): { t: (key: string, vars?: Vars) => string; lang: Lang } {
  const { lang, t: sharedT } = useI18n();
  const t = (key: string, vars?: Vars): string => {
    const text = lookup(DICTS[lang], key) ?? lookup(DICTS.en, key);
    return text === undefined ? sharedT(key, vars) : interpolate(text, vars);
  };
  return { t, lang };
}

/** Plural helper for the two-form counts used in these features (English differs at 1, Hindi at 1 too). */
export function countLabel(
  t: (key: string, vars?: Vars) => string,
  oneKey: string,
  manyKey: string,
  n: number,
): string {
  return n === 1 ? t(oneKey, { n }) : t(manyKey, { n });
}
