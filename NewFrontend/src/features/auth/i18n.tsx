"use client";

// Auth copy lives in its own namespaced files (src/messages/auth.en.json / auth.hi.json) so the auth pages
// never edit the shared en.json / hi.json. Keys are still written as `auth.*`; the root provider resolves
// them first if that namespace is merged there, otherwise this hook reads the local dictionaries.
import { useCallback } from "react";
import { useI18n } from "@/lib/i18n";
import authEn from "@/messages/auth.en.json";
import authHi from "@/messages/auth.hi.json";

type Vars = Record<string, string | number>;
export type AuthTranslator = (key: string, vars?: Vars) => string;

const DICTS = { en: authEn, hi: authHi } as const;

function lookup(dict: unknown, key: string): string | undefined {
  const value = key
    .split(".")
    .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], dict);
  return typeof value === "string" ? value : undefined;
}

function interpolate(template: string, vars?: Vars): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? `{${name}}`));
}

/** `t` for the auth namespace; accepts both "auth.login.submit" and "login.submit". */
export function useAuthT(): { t: AuthTranslator; lang: "en" | "hi" } {
  const { t: rootT, lang } = useI18n();

  const t = useCallback(
    (key: string, vars?: Vars) => {
      const fullKey = key.startsWith("auth.") ? key : `auth.${key}`;
      const fromRoot = rootT(fullKey);
      const text =
        fromRoot !== fullKey ? fromRoot : (lookup(DICTS[lang], fullKey) ?? lookup(DICTS.en, fullKey) ?? fullKey);
      return interpolate(text, vars);
    },
    [rootT, lang],
  );

  return { t, lang };
}
