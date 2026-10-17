import dictionaries from "./dictionaries.json";

export const SUPPORTED_LANGUAGES = ["en", "hi"];
export const DEFAULT_LANGUAGE = "hi";
export const LANG_STORAGE_KEY = "kisan-mitra-lang";

export function getDictionary(lang) {
  return dictionaries[lang] || dictionaries[DEFAULT_LANGUAGE];
}

/**
 * Resolve a dotted key ("home.primaryCta") against a dictionary.
 * Returns the key itself when missing so a missing string is visible in the
 * UI and in screenshots rather than silently blank.
 */
export function translate(lang, key) {
  const dict = getDictionary(lang);
  const value = key.split(".").reduce((node, part) => {
    if (node && typeof node === "object" && part in node) return node[part];
    return undefined;
  }, dict);
  return typeof value === "string" ? value : key;
}
