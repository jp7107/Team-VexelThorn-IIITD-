"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, type ChangeEvent } from "react";
import { CROP_ICONS } from "@/components/icons";
import { Button, FormError, Loading, Screen } from "@/components/ui";
import { api, ApiError, type Analysis, type Crop } from "@/lib/api";
import { errorKey } from "@/lib/forms";
import { useI18n } from "@/lib/i18n";
import { prepareLeafPhoto } from "@/lib/image";
import { useSession } from "@/lib/session";

// Crops the classifier knows (backend app/ml/labels.json). Others get the "unsupported" path server-side.
const SUPPORTED = ["tomato", "potato", "maize"] as const;

type Phase = "idle" | "preparing" | "checking";

function PhotoButton({ label, capture, onPick, primary }: {
  label: string;
  capture: boolean;
  onPick: (e: ChangeEvent<HTMLInputElement>) => void;
  primary?: boolean;
}) {
  // A real file input stays in the tab order (sr-only); the label is the visible, tappable button.
  return (
    <label className={`flex min-h-12 cursor-pointer items-center justify-center rounded-xl px-5 text-lg font-extrabold
      focus-within:outline-3 focus-within:outline-offset-2 focus-within:outline-haldi
      ${primary ? "bg-brand text-white" : "border-2 border-ink bg-white/10 text-ink"}`}>
      <input type="file" accept="image/*" className="sr-only" onChange={onPick}
        {...(capture ? { capture: "environment" as const } : {})} />
      {label}
    </label>
  );
}

export default function DiagnosePage() {
  const { t } = useI18n();
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
      <fieldset className="mb-6">
        <legend className="mb-1 text-lg font-semibold">{t("diagnose.whichCrop")}</legend>
        <p className="mb-3 text-base text-muted">{t("diagnose.supportedNote")}</p>
        <div className="grid grid-cols-3 gap-2">
          {SUPPORTED.map((c) => {
            const Icon = CROP_ICONS[c];
            return (
              <button key={c} type="button" aria-pressed={crop === c} onClick={() => setCrop(c)}
                className={`flex min-h-24 flex-col items-center justify-center gap-1 rounded-xl border-2 text-lg font-extrabold
                  ${crop === c ? "border-ink bg-surface text-ink" : "border-line bg-white/10 text-text"}`}>
                <Icon className="size-9" />
                {t(`crops.${c}`)}
              </button>
            );
          })}
        </div>
      </fieldset>

      {preview ? (
        // eslint-disable-next-line @next/next/no-img-element -- local blob URL, nothing for next/image to optimise
        <img src={preview} alt={t("diagnose.photoAlt")} className="mb-4 aspect-square w-full rounded-2xl object-cover" />
      ) : (
        <section className="mb-4 rounded-2xl bg-field-soft p-4">
          <h2 className="mb-2 text-lg font-extrabold text-field">{t("diagnose.tipsTitle")}</h2>
          <ul className="list-disc space-y-1 pl-5 text-lg">
            <li>{t("diagnose.tip1")}</li>
            <li>{t("diagnose.tip2")}</li>
            <li>{t("diagnose.tip3")}</li>
          </ul>
        </section>
      )}

      <FormError message={error} />
      {phase === "preparing" && <p className="mb-4 text-lg text-muted" role="status">{t("diagnose.preparing")}</p>}

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <PhotoButton label={t("diagnose.takePhoto")} capture onPick={pick} primary={!photo} />
          <PhotoButton label={t("diagnose.choosePhoto")} capture={false} onPick={pick} />
        </div>
        {photo && (
          <Button type="button" onClick={check} disabled={busy} aria-busy={phase === "checking"}>
            {phase === "checking" ? t("diagnose.checking") : t("diagnose.check")}
          </Button>
        )}
      </div>
    </Screen>
  );
}
