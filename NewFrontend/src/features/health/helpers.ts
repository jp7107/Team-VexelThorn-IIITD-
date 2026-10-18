// Crop-health helpers: upload constraints, status presentation and small formatters.
// Everything user-facing here receives text from the caller (or uses shared format helpers), so this file
// stays language-neutral.
import type { Analysis, AnalysisStatus } from "@/lib/api";
import type { Lang } from "@/lib/i18n";
import { cropLabel } from "@/lib/format";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ACCEPTED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export const UPLOAD_ACCEPT = ACCEPTED_MIME.join(",");
export const MAX_UPLOAD_LABEL = "5 MB";

export type UploadProblem = "type" | "size" | "empty" | null;

/** Client-side pre-check. The server remains the authority (415 / 413). */
export function validateLeafFile(file: File): UploadProblem {
  if (file.size === 0) return "empty";
  if (!(ACCEPTED_MIME as readonly string[]).includes(file.type)) return "type";
  if (file.size > MAX_UPLOAD_BYTES) return "size";
  return null;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb < 10 ? 1 : 0)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot + 1).toUpperCase() : "";
}

/** Full local timestamp for a record page (date + HH:MM). */
export function dateTime(iso: string | null | undefined, lang: Lang = "en"): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export type Outcome = "healthy" | "disease" | "uncertain" | "unsupported" | "rejected" | "error";

/** Presentation bucket for one check. "healthy" is only ever derived from prediction.is_healthy. */
export function outcomeOf(a: Pick<Analysis, "status" | "prediction">): Outcome {
  if (a.status === "ok") {
    if (!a.prediction) return "error";
    return a.prediction.is_healthy ? "healthy" : "disease";
  }
  if (a.status === "uncertain") return "uncertain";
  if (a.status === "unsupported") return "unsupported";
  if (a.status === "rejected_quality") return "rejected";
  return "error";
}

export type OutcomeTone = "good" | "bad" | "info" | "neutral" | "sample";

export function outcomeTone(outcome: Outcome): OutcomeTone {
  switch (outcome) {
    case "healthy":
      return "good";
    case "disease":
    case "error":
      return "bad";
    case "uncertain":
      return "info";
    case "rejected":
      return "sample";
    default:
      return "neutral";
  }
}

/** Short status word shown in badges and table cells (status + health combined). */
export function outcomeShort(
  a: Pick<Analysis, "status" | "prediction">,
  lang: Lang,
  statusLabel: (status: AnalysisStatus, lang: Lang) => string,
  labels: { healthy: string; disease: string },
): string {
  const outcome = outcomeOf(a);
  if (outcome === "healthy") return labels.healthy;
  if (outcome === "disease") return labels.disease;
  if (outcome === "rejected") return statusLabel("rejected_quality", lang).split(" · ")[0];
  return statusLabel(a.status, lang);
}

/** Main result line for a check, with the crop name already resolved. */
export function resultTitle(
  a: Analysis,
  lang: Lang,
  copy: {
    healthy: string;
    diseaseFound: string;
    statusTitle: Record<Outcome, string>;
  },
): string {
  const outcome = outcomeOf(a);
  if (outcome === "healthy") return copy.healthy;
  if (outcome === "disease") {
    const name = a.prediction ? (lang === "hi" ? a.prediction.name_hi : a.prediction.name) : null;
    return name ? `${copy.diseaseFound} · ${name}` : copy.diseaseFound;
  }
  return copy.statusTitle[outcome];
}

export function resultSubtitle(a: Analysis, lang: Lang, copy: Record<Outcome, string>): string {
  return copy[outcomeOf(a)] ?? "";
}

/** Crop displayed for a check: the model's crop when present, else what the farmer claimed. */
export function analysisCrop(a: Analysis, lang: Lang): string {
  return cropLabel(a.prediction?.crop_code || a.crop_code_claimed, lang);
}

export function provenanceKey(a: Analysis): "trained" | "thirdParty" | "mock" {
  if (a.model.provenance === "trained_in_house") return "trained";
  if (a.model.provenance === "third_party_pretrained") return "thirdParty";
  return "mock";
}

/** Top-k rows ordered by probability, capped so the panel stays compact. */
export function rankedTopK(a: Analysis, limit = 5) {
  return [...(a.top_k ?? [])].sort((x, y) => y.p - x.p).slice(0, limit);
}

export const ANALYSIS_STATUSES: AnalysisStatus[] = ["ok", "uncertain", "unsupported", "rejected_quality", "error"];
