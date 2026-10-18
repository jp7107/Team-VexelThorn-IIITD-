"use client";

// Leaf upload flow. Constraints are pre-checked here for fast feedback; the server remains the authority
// (415 unsupported format, 413 too large, 503 model unavailable). Only the local File object is previewed —
// the API returns no image URL.

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from "react";
import { RequireRole } from "@/lib/session";
import { useApi } from "@/lib/useApi";
import { ApiError, describeError, uploadAnalysis, type Analysis, type Crop } from "@/lib/api";
import { CROP_OPTIONS, cropLabel } from "@/lib/format";
import { Badge, Button, ButtonLink, PageHeading, Panel } from "@/components/ui";
import {
  AlertIcon,
  ArrowRightIcon,
  CameraIcon,
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  ImageIcon,
  InfoIcon,
  LeafIcon,
} from "@/components/icons";
import { ResultSummary } from "@/features/health/components";
import { useHealthT } from "@/features/health/i18n";
import {
  MAX_UPLOAD_LABEL,
  UPLOAD_ACCEPT,
  fileExtension,
  formatBytes,
  validateLeafFile,
  type UploadProblem,
} from "@/features/health/helpers";
import "@/features/health/health.css";

export default function DiagnosePage() {
  return <RequireRole roles={["farmer"]}>{() => <Diagnose />}</RequireRole>;
}

type ServerProblem = { status: number; message: string } | null;

function Diagnose() {
  const { t, lang } = useHealthT();
  const fileInput = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cropCode, setCropCode] = useState<string>("");
  const [farmCropId, setFarmCropId] = useState<string>("");
  const [clientProblem, setClientProblem] = useState<UploadProblem>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverProblem, setServerProblem] = useState<ServerProblem>(null);
  const [result, setResult] = useState<Analysis | null>(null);
  const [resultAt, setResultAt] = useState<string>("");

  const crops = useApi<Crop[]>("/me/crops");

  // The blob URL is created with the selection (never from an effect) and revoked when it is replaced.
  const previewRef = useRef<string | null>(null);
  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  const selectFile = useCallback((next: File | null) => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = next ? URL.createObjectURL(next) : null;
    setFile(next);
    setPreviewUrl(previewRef.current);
  }, []);

  const linkedOptions = (crops.data ?? []).filter((c) => c.crop_code === cropCode);

  const onCropChange = (next: string) => {
    setCropCode(next);
    if (farmCropId) {
      const stillValid = (crops.data ?? []).some((c) => c.id === farmCropId && c.crop_code === next);
      if (!stillValid) setFarmCropId("");
    }
  };

  const takeFile = useCallback(
    (next: File | undefined | null) => {
      setServerProblem(null);
      setResult(null);
      setFormError(null);
      if (!next) {
        selectFile(null);
        setClientProblem(null);
        return;
      }
      const problem = validateLeafFile(next);
      setClientProblem(problem);
      const problemText =
        problem === "type"
          ? t("health.invalidType")
          : problem === "size"
            ? t("health.invalidSize")
            : problem === "empty"
              ? t("health.invalidEmpty")
              : null;
      setFormError(problemText);
      selectFile(problem ? null : next);
    },
    [t, selectFile],
  );

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    takeFile(e.target.files?.[0] ?? null);
    // Allow picking the same file again after removal.
    e.target.value = "";
  };

  const onDrop = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setDragging(false);
    takeFile(e.dataTransfer.files?.[0] ?? null);
  };

  const remove = () => {
    selectFile(null);
    setFormError(null);
    setClientProblem(null);
    setServerProblem(null);
  };

  const submit = async () => {
    if (!file || busy) return;
    if (!cropCode) {
      setFormError(t("health.cropRequired"));
      return;
    }
    setFormError(null);
    setServerProblem(null);
    setBusy(true);
    try {
      const analysis = await uploadAnalysis(file, cropCode, farmCropId || undefined);
      setResult(analysis);
      setResultAt(new Date().toISOString());
    } catch (e) {
      const err = e instanceof ApiError ? e : null;
      if (err?.status === 415) setServerProblem({ status: 415, message: t("health.serverRejectedType") });
      else if (err?.status === 413) setServerProblem({ status: 413, message: t("health.serverRejectedSize") });
      else if (err?.status === 503) setServerProblem({ status: 503, message: t("health.serverUnavailable") });
      else setServerProblem({ status: err?.status ?? 0, message: describeError(e) });
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setFile(null);
    setResult(null);
    setServerProblem(null);
    setFormError(null);
    setFarmCropId("");
  };

  const busyLabel = busy ? t("health.submitting") : "";

  return (
    <div className="kmh-page">
      <nav aria-label="Breadcrumb" className="kmh-crumb">
        <Link href="/health">{t("health.title")}</Link>
        <ChevronRightIcon size={11} aria-hidden="true" />
        <span aria-current="page">{t("health.scanLeaf")}</span>
      </nav>

      <PageHeading
        title={t("health.diagnoseTitle")}
        subtitle={t("health.diagnoseSubtitle")}
        actions={
          <ButtonLink href="/health" variant="secondary" size="sm">
            {t("health.backToHealth")}
          </ButtonLink>
        }
      />

      <div className="kmh-diagnose-grid">
        <Panel title={t("health.stepUpload")} icon={<CameraIcon size={18} style={{ color: "var(--km-green-700)" }} />} badge={<Badge tone="neutral">{t("health.formatsHint")}</Badge>}>
          <div className="kmh-stack-sm">
            <input
              ref={fileInput}
              id="kmh-leaf-file"
              type="file"
              accept={UPLOAD_ACCEPT}
              className="km-sr-only"
              aria-label={t("health.chooseFile")}
              onChange={onPick}
              disabled={busy}
            />

            {!file ? (
              <button
                type="button"
                className="kmh-dropzone"
                data-dragging={dragging ? "true" : "false"}
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                aria-describedby="kmh-drop-hint"
                disabled={busy}
              >
                <span className="kmh-dropzone-tile" aria-hidden="true">
                  <ImageIcon size={22} />
                </span>
                <span className="kmh-dropzone-title">{t("health.dropTitle")}</span>
                <span className="km-caption" id="kmh-drop-hint">
                  {t("health.dropHint")}
                </span>
              </button>
            ) : (
              <div className="kmh-preview">
                <div className="kmh-preview-img">
                  {previewUrl && (
                    // The user's own local file, previewed from a blob URL the API never sees.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={previewUrl} alt={t("health.previewAlt")} />
                  )}
                </div>
                <div className="kmh-preview-meta">
                  <span className="km-icon-tile" style={{ width: 30, height: 30, borderRadius: 8, background: "var(--km-green-50)", color: "var(--km-green-700)" }}>
                    <CheckIcon size={15} />
                  </span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className="kmh-file-name" title={file.name}>
                      {file.name}
                    </span>
                    <span className="kmh-file-sub">
                      {fileExtension(file.name) ? `${fileExtension(file.name)} · ` : ""}
                      {formatBytes(file.size)} / {MAX_UPLOAD_LABEL}
                    </span>
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => fileInput.current?.click()}
                    disabled={busy}
                  >
                    {t("health.replaceFile")}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={remove}
                    disabled={busy}
                    aria-label={t("health.removeFile")}
                    title={t("health.removeFile")}
                    style={{ color: "var(--km-red-700)", padding: "0 7px" }}
                  >
                    <CloseIcon size={14} />
                  </Button>
                </div>
              </div>
            )}

            {clientProblem && !file && (
              <p className="kmh-inline-error" role="alert">
                <AlertIcon size={14} style={{ flex: "none" }} />
                <span>{formError}</span>
              </p>
            )}

            <p className="km-footnote">
              <InfoIcon size={11} style={{ display: "inline", verticalAlign: "-1px", marginRight: 4 }} />
              {t("health.scanSubtitle")}
            </p>
          </div>
        </Panel>

        <Panel title={t("health.diagnoseTitle")} icon={<LeafIcon size={18} style={{ color: "var(--km-green-700)" }} />} badge={<Badge tone="guidance">{t("health.notADiagnosis")}</Badge>}>
          <form
            className="kmh-form"
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            noValidate
          >
            <div className="km-field">
              <label className="km-label" htmlFor="kmh-crop">
                {t("health.cropLabel")}
              </label>
              <select
                id="kmh-crop"
                className="km-select"
                value={cropCode}
                onChange={(e) => onCropChange(e.target.value)}
                disabled={busy}
                required
                aria-describedby="kmh-crop-hint"
              >
                <option value="">{t("health.cropLabel")}…</option>
                {CROP_OPTIONS.map((code) => (
                  <option key={code} value={code}>
                    {cropLabel(code, lang)}
                  </option>
                ))}
              </select>
              <span className="km-hint" id="kmh-crop-hint">
                {t("health.cropHint")}
              </span>
            </div>

            <div className="km-field">
              <label className="km-label" htmlFor="kmh-farm-crop">
                {t("health.linkCropLabel")}
              </label>
              {crops.loading ? (
                <p className="km-hint">{t("health.cropsLoading")}</p>
              ) : crops.error ? (
                <p className="km-hint" role="status">
                  {t("health.cropsError")}
                </p>
              ) : (
                <>
                  <select
                    id="kmh-farm-crop"
                    className="km-select"
                    value={farmCropId}
                    onChange={(e) => setFarmCropId(e.target.value)}
                    disabled={busy || !cropCode || linkedOptions.length === 0}
                    aria-describedby="kmh-farm-crop-hint"
                  >
                    <option value="">{t("health.linkCropNone")}</option>
                    {linkedOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {cropLabel(c.crop_code, lang)}
                        {c.variety ? ` · ${c.variety}` : ""} · {c.sowing_date}
                      </option>
                    ))}
                  </select>
                  <span className="km-hint" id="kmh-farm-crop-hint">
                    {cropCode && linkedOptions.length === 0 ? t("health.noSavedCrops") : t("health.linkCropHint")}
                  </span>
                </>
              )}
            </div>

            {formError && file && (
              <p className="kmh-inline-error" role="alert">
                <AlertIcon size={14} style={{ flex: "none" }} />
                <span>{formError}</span>
              </p>
            )}

            {serverProblem && (
              <div className="kmh-inline-error" role="alert">
                <AlertIcon size={14} style={{ flex: "none", marginTop: 1 }} />
                <span>
                  {serverProblem.message}
                  {serverProblem.status ? ` (${serverProblem.status})` : ""}
                </span>
              </div>
            )}

            <div className="kmh-form-actions">
              <Button type="submit" disabled={busy || !file}>
                <CameraIcon size={15} /> {busy ? t("health.submitting") : t("health.submit")}
              </Button>
              {file && (
                <Button variant="secondary" onClick={remove} disabled={busy}>
                  {t("health.removeFile")}
                </Button>
              )}
            </div>

            <p className="kmh-upload-status" role="status" aria-live="polite">
              {busy ? `${busyLabel} · ${t("health.submittingHint")}` : ""}
            </p>
          </form>
        </Panel>
      </div>

      <div aria-live="polite">
        {result && (
          <Panel
            title={t("health.resultReady")}
            icon={<CheckIcon size={18} style={{ color: "var(--km-green-700)" }} />}
            badge={<Badge tone="good">{new Date(resultAt).toLocaleTimeString(lang === "hi" ? "hi-IN" : "en-IN")}</Badge>}
          >
            <div className="kmh-stack-sm">
              <ResultSummary analysis={result} />
              <div className="kmh-actions">
                <ButtonLink href={`/analyses/${result.id}`}>
                  {t("health.openFullResult")} <ArrowRightIcon size={14} />
                </ButtonLink>
                <Button variant="secondary" onClick={reset}>
                  <CameraIcon size={14} /> {t("health.tryAgain")}
                </Button>
              </div>
            </div>
          </Panel>
        )}
      </div>

      {!result && !busy && !file && crops.data && crops.data.length === 0 && (
        <p className="km-footnote">{t("health.noSavedCrops")}</p>
      )}
    </div>
  );
}
