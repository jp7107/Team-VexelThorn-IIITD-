"use client";

// Marketplace copy lives in src/messages/market.en.json|market.hi.json under the "market" namespace.
// t() resolves market.* from those files and delegates every other key (common.*, demo.*) to the shared
// dictionary, so this feature works the moment it is added and after the namespace is merged into the
// shared files.
import { useCallback, useMemo } from "react";
import { useI18n, type Lang } from "@/lib/i18n";
import en from "@/messages/market.en.json";
import hi from "@/messages/market.hi.json";
import type { Unit } from "@/lib/api";

const DICTS: Record<Lang, unknown> = { en, hi };

type Vars = Record<string, string | number>;

function lookup(dict: unknown, key: string): string | undefined {
  const v = key.split(".").reduce<unknown>((node, part) => {
    if (node && typeof node === "object") return (node as Record<string, unknown>)[part];
    return undefined;
  }, dict);
  return typeof v === "string" ? v : undefined;
}

export function useMarketI18n(): { lang: Lang; t: (key: string, vars?: Vars) => string; unitLabel: (u: Unit) => string } {
  const { lang, t: sharedT } = useI18n();

  const t = useCallback(
    (key: string, vars?: Vars) => {
      const raw = lookup(DICTS[lang], key) ?? lookup(DICTS.en, key);
      const s = raw ?? sharedT(key);
      return vars ? s.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`)) : s;
    },
    [lang, sharedT],
  );

  const unitLabel = useCallback((u: Unit) => t(`market.units.${u}`), [t]);

  return useMemo(() => ({ lang, t, unitLabel }), [lang, t, unitLabel]);
}

/** Status / role label helpers built on the same dictionary. */
export function useMarketLabels() {
  const { t, lang, unitLabel } = useMarketI18n();
  const statusLabel = useCallback(
    (s: "open" | "closed" | "hidden") =>
      s === "open" ? t("market.open") : s === "closed" ? t("market.closed") : t("market.hidden"),
    [t],
  );
  return { t, lang, unitLabel, statusLabel };
}
