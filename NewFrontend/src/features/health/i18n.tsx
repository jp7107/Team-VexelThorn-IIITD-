"use client";

// Crop-health copy lives in its own namespaced files (src/messages/health.en.json / health.hi.json) so this
// feature never edits the shared en.json / hi.json. The root provider merges that subtree when present; until
// then this hook resolves the same flat keys against the local dictionaries, so `t("health.scanLeaf")` works
// either way.
import { useCallback } from "react";
import { useI18n } from "@/lib/i18n";
import healthEn from "@/messages/health.en.json";
import healthHi from "@/messages/health.hi.json";

export type HealthVars = Record<string, string | number>;
export type HealthTranslator = (key: string, vars?: HealthVars) => string;

const DICTS = { en: healthEn, hi: healthHi } as const;

function lookup(dict: unknown, key: string): string | undefined {
  const value = key
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], dict);
  return typeof value === "string" ? value : undefined;
}

function interpolate(template: string, vars?: HealthVars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

export function useHealthT(): { t: HealthTranslator; lang: "en" | "hi" } {
  const { t: rootT, lang } = useI18n();

  const t = useCallback(
    (key: string, vars?: HealthVars) => {
      const fromRoot = rootT(key);
      const text =
        fromRoot !== key ? fromRoot : (lookup(DICTS[lang], key) ?? lookup(DICTS.en, key) ?? key);
      return interpolate(text, vars);
    },
    [rootT, lang],
  );

  return { t, lang };
}
