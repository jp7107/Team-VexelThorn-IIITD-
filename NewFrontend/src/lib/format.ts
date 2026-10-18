import type { Lang } from "@/lib/i18n";

export function localeFor(lang: Lang): string {
  return lang === "hi" ? "hi-IN" : "en-IN";
}

/** ₹1,800 style, no decimals for whole numbers. */
export function inr(value: string | number | null | undefined, lang: Lang = "en"): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(localeFor(lang), {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: n % 1 === 0 ? 0 : 2,
  }).format(n);
}

export function num(value: string | number | null | undefined, lang: Lang = "en"): string {
  if (value === null || value === undefined || value === "") return "—";
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat(localeFor(lang), { maximumFractionDigits: 2 }).format(n);
}

export function pct(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits)}%`;
}

export function shortDate(iso: string | null | undefined, lang: Lang = "en"): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(localeFor(lang), { day: "2-digit", month: "short", year: "numeric" }).format(d);
}

export function dayMonth(iso: string | null | undefined, lang: Lang = "en"): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(localeFor(lang), { day: "2-digit", month: "short" }).format(d);
}

export function timeAgo(iso: string | null | undefined, lang: Lang = "en"): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const mins = Math.round((Date.now() - then) / 60_000);
  if (mins < 1) return lang === "hi" ? "अभी" : "just now";
  if (mins < 60) return lang === "hi" ? `${mins} मिनट पहले` : `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return lang === "hi" ? `${hours} घंटे पहले` : `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return lang === "hi" ? `${days} दिन पहले` : `${days} d ago`;
  return shortDate(iso, lang);
}

/** YYYY-MM-DD for an <input type="date"> default. */
export function isoDate(d: Date = new Date()): string {
  return d.toISOString().slice(0, 10);
}

export function titleCase(s: string): string {
  return s.replace(/(^|[\s_-])(\w)/g, (_, sep: string, ch: string) => sep.replace(/[_-]/g, " ") + ch.toUpperCase());
}

const CROP_LABELS: Record<string, { en: string; hi: string }> = {
  tomato: { en: "Tomato", hi: "टमाटर" },
  potato: { en: "Potato", hi: "आलू" },
  maize: { en: "Maize", hi: "मक्का" },
  wheat: { en: "Wheat", hi: "गेहूँ" },
  mustard: { en: "Mustard", hi: "सरसों" },
  onion: { en: "Onion", hi: "प्याज़" },
  rice: { en: "Rice", hi: "चावल" },
  okra: { en: "Okra", hi: "भिंडी" },
};

export function cropLabel(code: string | null | undefined, lang: Lang = "en"): string {
  if (!code) return "—";
  const known = CROP_LABELS[code.toLowerCase()];
  if (known) return known[lang];
  return titleCase(code);
}

export const CROP_OPTIONS = Object.keys(CROP_LABELS);

export function statusTone(status: string): "good" | "bad" | "info" | "neutral" {
  if (status === "ok" || status === "healthy" || status === "accepted" || status === "open") return "good";
  if (status === "rejected_quality" || status === "error" || status === "declined" || status === "closed") return "bad";
  if (status === "uncertain" || status === "pending") return "info";
  return "neutral";
}

/** Analysis status copy shared by the dashboard, history and report pages. */
export const ANALYSIS_STATUS: Record<string, { en: string; hi: string }> = {
  ok: { en: "Diagnosis available", hi: "निदान उपलब्ध" },
  uncertain: { en: "Low confidence — needs a closer look", hi: "कम भरोसा — नज़दीक से जाँचें" },
  unsupported: { en: "This crop is not supported yet", hi: "यह फसल अभी समर्थित नहीं है" },
  rejected_quality: { en: "Photo quality was too low", hi: "फ़ोटो की गुणवत्ता कम थी" },
  error: { en: "The check could not be completed", hi: "जाँच पूरी नहीं हो सकी" },
};

export function analysisStatusLabel(status: string, lang: Lang = "en"): string {
  return ANALYSIS_STATUS[status]?.[lang] ?? status;
}

export const STAGE_LABELS: Record<string, { en: string; hi: string }> = {
  initial: { en: "Initial stage", hi: "शुरुआती अवस्था" },
  development: { en: "Development", hi: "विकास अवस्था" },
  mid: { en: "Mid season", hi: "मध्य अवस्था" },
  late: { en: "Late season", hi: "अंतिम अवस्था" },
};

export function stageLabel(stage: string | null | undefined, lang: Lang = "en"): string {
  if (!stage) return "—";
  return STAGE_LABELS[stage]?.[lang] ?? titleCase(stage);
}

/** Minimal Indian states list for profile / filters (matches the existing app's data shape). */
export const STATES: { value: string; hi: string }[] = [
  { value: "Andhra Pradesh", hi: "आंध्र प्रदेश" },
  { value: "Bihar", hi: "बिहार" },
  { value: "Chhattisgarh", hi: "छत्तीसगढ़" },
  { value: "Delhi", hi: "दिल्ली" },
  { value: "Gujarat", hi: "गुजरात" },
  { value: "Haryana", hi: "हरियाणा" },
  { value: "Himachal Pradesh", hi: "हिमाचल प्रदेश" },
  { value: "Jharkhand", hi: "झारखंड" },
  { value: "Karnataka", hi: "कर्नाटक" },
  { value: "Kerala", hi: "केरल" },
  { value: "Madhya Pradesh", hi: "मध्य प्रदेश" },
  { value: "Maharashtra", hi: "महाराष्ट्र" },
  { value: "Odisha", hi: "ओडिशा" },
  { value: "Punjab", hi: "पंजाब" },
  { value: "Rajasthan", hi: "राजस्थान" },
  { value: "Tamil Nadu", hi: "तमिलनाडु" },
  { value: "Telangana", hi: "तेलंगाना" },
  { value: "Uttar Pradesh", hi: "उत्तर प्रदेश" },
  { value: "Uttarakhand", hi: "उत्तराखंड" },
  { value: "West Bengal", hi: "पश्चिम बंगाल" },
];
