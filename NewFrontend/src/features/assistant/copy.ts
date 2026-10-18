"use client";

// Copy for the assistant feature. Every string is requested as t("assistant.<key>") from the shared
// i18n context; until the assistant namespace is merged into src/messages/{en,hi}.json the shared lookup
// returns the key itself, so we fall back to the feature fragments below for the active language.
import { useCallback } from "react";
import { useI18n, type Lang } from "@/lib/i18n";
import enFragment from "@/messages/assistant.en.json";
import hiFragment from "@/messages/assistant.hi.json";

type Vars = Record<string, string | number>;
type Dict = Record<string, unknown>;

const FRAGMENTS: Record<Lang, Dict> = {
  en: (enFragment as Dict).assistant as Dict,
  hi: (hiFragment as Dict).assistant as Dict,
};

function dig(dict: Dict | undefined, path: string): string | undefined {
  if (!dict) return undefined;
  let node: unknown = dict;
  for (const part of path.split(".")) {
    node = (node as Dict | undefined)?.[part];
  }
  return typeof node === "string" ? node : undefined;
}

function interpolate(s: string, vars?: Vars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`));
}

export type AssistantCopy = (key: string, vars?: Vars) => string;

export function useAssistantCopy(): AssistantCopy {
  const { t, lang } = useI18n();
  return useCallback(
    (key: string, vars?: Vars) => {
      const full = `assistant.${key}`;
      const shared = t(full, vars);
      // A missing key resolves to the key itself in src/lib/i18n.tsx.
      if (shared !== full) return shared;
      const local = dig(FRAGMENTS[lang], key) ?? dig(FRAGMENTS.en, key);
      return local ? interpolate(local, vars) : full;
    },
    [t, lang],
  );
}
