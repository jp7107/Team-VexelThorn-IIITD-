"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ChangeEvent } from "react";
import { CROP_ICONS, SproutIcon } from "@/components/icons";
import { Button, FormError, Loading, Screen } from "@/components/ui";
import { api, ApiError, type Analysis, type Crop } from "@/lib/api";
import { errorKey } from "@/lib/forms";
import { cropLabel, useCrops } from "@/lib/catalogue";
import { useI18n } from "@/lib/i18n";
import { prepareLeafPhoto } from "@/lib/image";
import { useSession } from "@/lib/session";


type Phase = "idle" | "preparing" | "checking";

function CameraIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 8h3l2-2.5h6L17 8h3v11H4V8Z" /><circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

function GalleryIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={className} fill="none" stroke="currentColor" strokeWidth={1.8}
      strokeLinecap="round" strokeLinejoin="round">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2" /><path d="m4 17 5-5 4 4 2.5-2.5L20 18" /><circle cx="15.5" cy="9" r="1.5" />
    </svg>
  );
}

function PhotoButton({ label, capture, onPick, primary }: {
  label: string;
  capture: boolean;
  onPick: (e: ChangeEvent<HTMLInputElement>) => void;
  primary?: boolean;
}) {
  // A real file input stays in the tab order (sr-only); the label is the visible, tappable button.
  const Icon = capture ? CameraIcon : GalleryIcon;
  return (
    <label className={`flex min-h-11 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-2 text-sm font-bold
      focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-lime
      ${primary ? "bg-lime text-ink-strong" : "border border-white/30 bg-white/10 text-ink"}`}>
      <input type="file" accept="image/*" className="sr-only" onChange={onPick}
        {...(capture ? { capture: "environment" as const } : {})} />
      <Icon className="size-5 shrink-0" />
      {label}
    </label>
  );
}

export default function DiagnosePage() {
  const { t, lang } = useI18n();
  const catalogue = useCrops();
  const router = useRouter();
  const { user } = useSession(["farmer"]);
  const [crops, setCrops] = useState<Crop[]>([]);
  const [crop, setCrop] = useState<string>("");
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string>("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    if (user) api<Crop[]>("/me/crops").then(setCrops).catch(() => setCrops([]));
  }, [user]);

  // Free the previous preview's memory when the photo changes or the page unmounts.
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  if (!user) return <Screen><Loading /></Screen>;

  async function pick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // picking the same file again should still fire onChange
    if (!file) return;
    setError("");
    setPhase("preparing");
    const blob = await prepareLeafPhoto(file);
    setPhoto(blob);
    setPreview(URL.createObjectURL(blob));
    setPhase("idle");
  }

  async function check() {
    if (!crop) return setError(t("diagnose.pickCropFirst"));
    if (!photo) return setError(t("diagnose.pickPhotoFirst"));
    setError("");
    setPhase("checking");
    const form = new FormData();
    form.append("crop_code", crop);
    form.append("image", photo, "leaf.jpg");
    // Link the check to the farmer's saved crop of the same kind, so reminders point at it.
    const saved = crops.find((c) => c.crop_code === crop);
    if (saved) form.append("farm_crop_id", saved.id);
    try {
      const analysis = await api<Analysis>("/analyses", { form });
      router.push(`/farmer/analyses/${analysis.id}`);
    } catch (err) {
      const status = err instanceof ApiError ? err.status : 0;
      setError(t(status === 503 ? "diagnose.modelUnavailable"
        : status === 413 || status === 415 ? "diagnose.photoFormat" : errorKey(err)));
      setPhase("idle");
    }
  }

  const busy = phase !== "idle";
  return (
    <Screen title={t("diagnose.title")} back="/farmer">
      <fieldset className="mb-4">
        <legend className="mb-0.5 flex items-center gap-2 font-semibold">
          <span className="grid size-6 place-items-center rounded-full bg-white text-xs font-bold text-ink-strong">1</span>
          {t("diagnose.whichCrop")}
        </legend>
        <p className="mb-3 pl-8 text-sm text-muted">{t("diagnose.supportedNote")}</p>
        <div className="grid grid-cols-3 gap-2">
          {/* Crops the leaf model knows (leaf_check comes from the model's labels via /crops). */}
          {(catalogue ?? []).filter((x) => x.leaf_check).map(({ code: c }) => {
            const Icon = CROP_ICONS[c] ?? SproutIcon;
            return (
              <button key={c} type="button" aria-pressed={crop === c} onClick={() => setCrop(c)}
                className={`flex min-h-20 flex-col items-center justify-center gap-1 rounded-2xl border text-sm font-bold transition
                  ${crop === c ? "border-white bg-white text-ink-strong" : "glass border-white/15 text-text"}`}>
                <Icon className="size-7" />
                {cropLabel(catalogue, c, lang)}
              </button>
            );
          })}
        </div>
      </fieldset>

      <section className="glass mb-4 rounded-2xl border border-white/15 p-3">
        <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
          <span className="grid size-6 place-items-center rounded-full bg-white text-xs font-bold text-ink-strong">2</span>
          {preview ? t("diagnose.photoAlt") : t("diagnose.tipsTitle")}
        </h2>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local blob URL, nothing for next/image to optimise
          <img src={preview} alt={t("diagnose.photoAlt")} className="mb-3 aspect-[4/3] w-full rounded-xl object-cover" />
        ) : (
          <ul className="mb-3 space-y-1.5 text-sm">
            {["tip1", "tip2", "tip3"].map((k) => (
              <li key={k} className="flex gap-2"><span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-lime" />{t(`diagnose.${k}`)}</li>
            ))}
          </ul>
        )}
        <div className="grid grid-cols-2 gap-2">
          <PhotoButton label={t("diagnose.takePhoto")} capture onPick={pick} primary={!photo} />
          <PhotoButton label={t("diagnose.choosePhoto")} capture={false} onPick={pick} />
        </div>
      </section>

      <FormError message={error} />
      {phase === "preparing" && <p className="mb-4 text-sm text-muted" role="status">{t("diagnose.preparing")}</p>}

      {photo && (
        <Button type="button" onClick={check} disabled={busy} aria-busy={phase === "checking"}>
          {phase === "checking" ? t("diagnose.checking") : t("diagnose.check")}
        </Button>
      )}
    </Screen>
  );
}
